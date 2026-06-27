export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import {
  findUserByUsername,
  getKeycloakError,
  getUserOnboardingStatus,
  hasAppMfaConfigured,
} from "../../../lib/keycloak-users";
import { verifyPasswordWithKeycloak } from "../../../lib/keycloak-password";
import { normalizeObjectTextFields } from "../../../lib/english-normalizer";

type KeycloakCredential = {
  type?: string;
};

async function readNativeKeycloakMfaConfigured(userId: string) {
  const response = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/credentials`,
  );

  if (!response.ok) {
    throw new Error(
      await getKeycloakError(response, "Failed to check native MFA credentials"),
    );
  }

  const credentials = await response.json();

  return Array.isArray(credentials)
    ? credentials.some((credential: KeycloakCredential) => credential.type === "otp")
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
      return NextResponse.json(
        {
          passwordValid: false,
          status: "INVALID_CREDENTIALS",
          error:
            passwordCheck.status === 500
              ? passwordCheck.error
              : "Invalid username or password",
        },
        { status: passwordCheck.status === 500 ? 500 : 401 },
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
    const nativeMfaConfigured = appMfaConfigured
      ? false
      : await readNativeKeycloakMfaConfigured(user.id);

    return NextResponse.json({
      passwordValid: true,
      status: "READY",
      mfaConfigured: appMfaConfigured || nativeMfaConfigured,
      appMfaConfigured,
      nativeMfaConfigured,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        passwordValid: false,
        status: "ERROR",
        error:
          await getKeycloakError(error, "Failed to verify password"),
      },
      { status: 500 },
    );
  }
}
