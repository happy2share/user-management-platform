export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import {
  findUserByUsername,
  getUserOnboardingStatus,
  hasAppMfaConfigured,
} from "../../../lib/keycloak-users";
import { verifyPasswordWithKeycloak } from "../../../lib/keycloak-password";
import {
  clearRateLimitIdentifier,
  rateLimitIdentifier,
} from "../../../lib/redis_utility";
import { normalizeObjectTextFields } from "../../../i18n/english-normalizer";

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

    const rateLimitScope = "password-check";
    const rateLimitKey = username.toLowerCase();
    if (await rateLimitIdentifier(rateLimitScope, rateLimitKey, 5, 300)) {
      return NextResponse.json(
        {
          passwordValid: false,
          status: "RATE_LIMITED",
          error: "Too many login attempts. Try again later.",
        },
        { status: 429 },
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
    await clearRateLimitIdentifier(rateLimitScope, rateLimitKey);

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

    return NextResponse.json({
      passwordValid: true,
      status: "READY",
      mfaConfigured: appMfaConfigured,
      appMfaConfigured,
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
