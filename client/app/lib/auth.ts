import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { KEYCLOAK_TOKEN_URL } from "./constants";
import { logError } from "./file-logger.mjs";
import { verifyUserAppOtp } from "./app-mfa";
import { verifyPasswordWithKeycloak } from "./keycloak-password";
import {
  ensureSsoUser,
  findUserByUsername,
  getUserRealmRoles,
  getUserOnboardingStatus,
  hasAppMfaConfigured,
  readAttributeValue,
} from "./keycloak-users";
import { keycloakAdminFetch } from "./keycloak";
import {
  clearRateLimitIdentifier,
  rateLimitIdentifier,
} from "./redis_utility";

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
  sessionVersion?: string;
};

type SsoUser = {
  id: string;
  name?: string;
  email?: string;
  needsUsername?: boolean;
  roles: string[];
  sessionVersion?: string;
};

const isProduction = process.env.NODE_ENV === "production";
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") || isProduction;
const sessionCookieName = `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`;

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
  const rateLimitScope = "credentials-login";
  const rateLimitKey = username.trim().toLowerCase();
  if (await rateLimitIdentifier(rateLimitScope, rateLimitKey, 5, 300)) {
    throw new Error("Too many login attempts. Try again later.");
  }

  const passwordCheck = await verifyPasswordWithKeycloak(username, password);
  if (!passwordCheck.ok) {
    throw new Error("Invalid username or password");
  }

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
    signal: AbortSignal.timeout(10_000),
  });

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok) {
    throw new Error(
      tokenData.error_description ||
        tokenData.error ||
        "Invalid Keycloak username, password, or OTP",
    );
  }
  await clearRateLimitIdentifier(rateLimitScope, rateLimitKey);

  const claims = decodeJwt<AccessTokenClaims>(tokenData.access_token) ?? {};

  return {
    id: user.id,
    name: claims.name || claims.preferred_username || username,
    email: claims.email || "",
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    idToken: tokenData.id_token,
    sessionVersion: readAttributeValue(user.attributes, "sessionVersion") || "",
    roles: claims.realm_access?.roles ?? [],
  };
}

export const authOptions: AuthOptions = {
  useSecureCookies,
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
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 30 * 60,
  },
  jwt: {
    maxAge: 8 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      const googleProfile = profile as
        | { email?: string; email_verified?: boolean; name?: string }
        | undefined;
      if (!googleProfile?.email || googleProfile.email_verified !== true) return false;

      try {
        await ensureSsoUser({
          email: googleProfile.email,
          name: googleProfile.name,
          provider: "google",
        });
        return true;
      } catch (error) {
        void logError("Google SSO Keycloak provisioning failed", {
          operation: "sso.google.provision",
          provider: "google",
          email: googleProfile.email,
          error,
        });
        return false;
      }
    },
    async jwt({ token, account, user, trigger, session }) {
      const mutableToken = token as typeof token & {
        accessToken?: string;
        idToken?: string;
        refreshToken?: string;
        userId?: string;
        needsUsername?: boolean;
        roles?: string[];
        sessionVersion?: string;
        accessRevoked?: boolean;
      };

      if (trigger === "update" && session?.needsUsername === false) {
        mutableToken.needsUsername = false;
      }

      const credentialUser = user as CredentialUser | undefined;

      if (credentialUser?.accessToken) {
        mutableToken.userId = credentialUser.id;
        mutableToken.accessToken = credentialUser.accessToken;
        mutableToken.idToken = credentialUser.idToken;
        mutableToken.refreshToken = credentialUser.refreshToken;
        mutableToken.sessionVersion = credentialUser.sessionVersion || "";
        mutableToken.roles =
          credentialUser.roles ?? readAccessTokenRoles(credentialUser.accessToken);
      } else if (account?.access_token) {
        mutableToken.accessToken = account.access_token;
        mutableToken.idToken = account.id_token;
        mutableToken.refreshToken = account.refresh_token;
        mutableToken.roles = readAccessTokenRoles(account.access_token);

        if (account.provider === "google" && user?.email) {
          const ssoUser = (await ensureSsoUser({
            email: user.email,
            name: user.name ?? undefined,
            provider: "google",
          })) as SsoUser;

          mutableToken.userId = ssoUser.id;
          mutableToken.needsUsername = ssoUser.needsUsername === true;
          mutableToken.sessionVersion = ssoUser.sessionVersion || "";
          mutableToken.roles = ssoUser.roles;
        }
      } else if (mutableToken.userId) {
        const userResponse = await keycloakAdminFetch(
          `/users/${encodeURIComponent(mutableToken.userId)}`,
        );
        if (!userResponse.ok) throw new Error("Unable to validate application session");

        const currentUser = await userResponse.json();
        const currentSessionVersion =
          readAttributeValue(currentUser.attributes, "sessionVersion") || "";
        if (
          currentUser.enabled === false ||
          currentSessionVersion !== (mutableToken.sessionVersion || "")
        ) {
          mutableToken.userId = undefined;
          mutableToken.roles = [];
          mutableToken.accessRevoked = true;
        } else {
          const currentRoles = await getUserRealmRoles(mutableToken.userId, {
            effective: true,
          });
          mutableToken.roles = currentRoles.map((role: { name?: string }) => role.name).filter(Boolean) as string[];
          mutableToken.accessRevoked = false;
        }
      }

      return mutableToken;
    },
    async session({ session, token }) {
      const typedToken = token as typeof token & {
        userId?: string;
        needsUsername?: boolean;
        roles?: string[];
        accessRevoked?: boolean;
      };

      return {
        ...session,
        userId: typedToken.userId,
        needsUsername: typedToken.needsUsername === true,
        roles: typedToken.roles ?? [],
        accessRevoked: typedToken.accessRevoked === true,
      };
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return baseUrl;
    },
  },
};
