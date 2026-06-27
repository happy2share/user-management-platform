import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { KEYCLOAK_TOKEN_URL } from "./constants";
import { getKeycloakError } from "./keycloak-error";
import { verifyUserAppOtp } from "./app-mfa";
import { findUserByUsername, getUserOnboardingStatus, hasAppMfaConfigured } from "./keycloak-users";

type AccessTokenClaims = {
  sub?: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  realm_access?: {
    roles?: string[];
  };
};

type CredentialUser = {
  id?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  roles?: string[];
};

function decodeJwt<T>(token?: string): T | null {
  if (!token) return null;

  try {
    return JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as T;
  } catch {
    return null;
  }
}

function readAccessTokenRoles(accessToken?: string) {
  const payload = decodeJwt<AccessTokenClaims>(accessToken);
  return payload?.realm_access?.roles ?? [];
}

async function loginWithKeycloakPassword(
  username: string,
  password: string,
  totp?: string,
) {
  const user = await findUserByUsername(username);

  if (!user?.id) {
    throw new Error("Invalid username or password");
  }

  const onboardingStatus = getUserOnboardingStatus(user);
  if (onboardingStatus === "EMAIL_VERIFICATION_REQUIRED") {
    throw new Error("Verify your email before login");
  }
  if (onboardingStatus === "MFA_SETUP_REQUIRED") {
    throw new Error("Set up MFA before login");
  }
  if (onboardingStatus !== "READY") {
    throw new Error("Account setup is not completed");
  }

  const appMfaConfigured = hasAppMfaConfigured(user);
  if (appMfaConfigured && !verifyUserAppOtp(user, totp)) {
    throw new Error("Invalid OTP");
  }

  const body = new URLSearchParams();
  body.append("grant_type", "password");
  body.append("client_id", process.env.KEYCLOAK_CLIENT_ID || "");

  if (process.env.KEYCLOAK_CLIENT_SECRET) {
    body.append("client_secret", process.env.KEYCLOAK_CLIENT_SECRET);
  }

  body.append("username", username);
  body.append("password", password);

  if (!appMfaConfigured && totp?.trim()) {
    body.append("totp", totp.trim());
  }

  body.append("scope", "openid profile email");

  const tokenRes = await fetch(KEYCLOAK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    throw new Error(
      await getKeycloakError(tokenRes, "Invalid Keycloak username, password, or OTP"),
    );
  }

  const tokenData = await tokenRes.json();

  const claims = decodeJwt<AccessTokenClaims>(tokenData.access_token) ?? {};

  return {
    id: claims.sub || claims.preferred_username || username,
    name: claims.name || claims.preferred_username || username,
    email: claims.email || "",
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    idToken: tokenData.id_token,
    roles: claims.realm_access?.roles ?? [],
  };
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      id: "keycloak-credentials",
      name: "IAM Portal Login",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        totp: { label: "OTP", type: "text" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim();
        const password = credentials?.password;
        const totp = credentials?.totp?.trim();

        if (!username || !password) {
          throw new Error("Username and password are required");
        }

        return loginWithKeycloakPassword(username, password, totp);
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, user }) {
      const mutableToken = token as typeof token & {
        accessToken?: string;
        idToken?: string;
        refreshToken?: string;
        userId?: string;
        roles?: string[];
      };

      const credentialUser = user as CredentialUser | undefined;

      if (credentialUser?.accessToken) {
        mutableToken.userId = credentialUser.id;
        mutableToken.accessToken = credentialUser.accessToken;
        mutableToken.idToken = credentialUser.idToken;
        mutableToken.refreshToken = credentialUser.refreshToken;
        mutableToken.roles =
          credentialUser.roles ?? readAccessTokenRoles(credentialUser.accessToken);
      } else if (account?.access_token) {
        mutableToken.accessToken = account.access_token;
        mutableToken.idToken = account.id_token;
        mutableToken.refreshToken = account.refresh_token;
        mutableToken.roles = readAccessTokenRoles(account.access_token);
      }

      return mutableToken;
    },
    async session({ session, token }) {
      const typedToken = token as typeof token & {
        accessToken?: string;
        idToken?: string;
        refreshToken?: string;
        userId?: string;
        roles?: string[];
      };

      return {
        ...session,
        accessToken: typedToken.accessToken,
        idToken: typedToken.idToken,
        refreshToken: typedToken.refreshToken,
        userId: typedToken.userId,
        roles: typedToken.roles ?? [],
      };
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return baseUrl;
    },
  },
};
