export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import {
  findUserByUsername,
  getUserOnboardingStatus,
  hasAppMfaConfigured,
} from "../../../lib/keycloak-users";
import { verifyPasswordWithKeycloak } from "../../../lib/keycloak-password";
import { normalizeObjectTextFields } from "../../../i18n/english-normalizer";

type KeycloakCredential = {
  type?: string;
};

async function readNativeKeycloakMfaConfigured(userId: string) {
  const response = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/credentials`,
  );

  if (!response.ok) {
    throw new Error(`Failed to read Keycloak MFA credentials (${response.status})`);
  }

  const credentials = await response.json();

  return Array.isArray(credentials)
    ? credentials.some(
        (credential: KeycloakCredential) => credential.type === "otp",
      )
    : false;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const username = body.username?.trim();
    const password = rawBody.password;

    if (!username || !password) {
      return NextResponse.json(
        { passwordValid: false, error: "Username and password are required" },
        { status: 400 },
      );
    }

    const passwordCheck = await verifyPasswordWithKeycloak(username, password);

    if (!passwordCheck.ok) {
      if (passwordCheck.status >= 500) {
        void logError("Keycloak password check failed", {
          endpoint: "/api/public/password-check",
          method: "POST",
          operation: "keycloak.passwordCheck",
          username,
          status: passwordCheck.status,
          error: passwordCheck.error,
        });
      }
      return NextResponse.json(
        {
          passwordValid: false,
          status: "INVALID_CREDENTIALS",
          error: "Invalid username or password",
        },
        { status: passwordCheck.status >= 500 ? 500 : 401 },
      );
    }

    const user = await findUserByUsername(username);

    if (!user?.id) {
      return NextResponse.json(
        {
          passwordValid: false,
          status: "INVALID_CREDENTIALS",
          error: "Invalid username or password",
        },
        { status: 401 },
      );
    }

    const onboardingStatus = getUserOnboardingStatus(user);

    if (onboardingStatus === "EMAIL_VERIFICATION_REQUIRED") {
      return NextResponse.json({
        passwordValid: true,
        status: "EMAIL_VERIFICATION_REQUIRED",
        mfaConfigured: false,
        error: "Verify your email before login.",
      });
    }

    if (onboardingStatus === "MFA_SETUP_REQUIRED") {
      return NextResponse.json({
        passwordValid: true,
        status: "MFA_SETUP_REQUIRED",
        mfaConfigured: false,
        error: "Set up MFA before login.",
      });
    }

    if (onboardingStatus !== "READY") {
      return NextResponse.json({
        passwordValid: true,
        status: "ONBOARDING_REQUIRED",
        mfaConfigured: false,
        error: "Account setup is not completed.",
      });
    }

    const appMfaConfigured = hasAppMfaConfigured(user);
    const nativeMfaConfigured = await readNativeKeycloakMfaConfigured(user.id);

    return NextResponse.json({
      passwordValid: true,
      status: "READY",
      mfaConfigured: appMfaConfigured || nativeMfaConfigured,
      appMfaConfigured,
      nativeMfaConfigured,
    });
  } catch (error: unknown) {
    void logError("Failed to verify password", {
      endpoint: "/api/public/password-check",
      method: "POST",
      operation: "passwordCheck",
      error,
    });
    return NextResponse.json(
      {
        passwordValid: false,
        status: "ERROR",
        error: "Failed to verify password",
      },
      { status: 500 },
    );
  }
}
