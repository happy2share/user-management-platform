export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { findUserByUsername } from "../../../../lib/keycloak-users";
import { verifyPasswordWithKeycloak } from "../../../../lib/keycloak-password";
import {
  buildOtpAuthUri,
  buildQrImageUrl,
  encryptText,
  isAppMfaConfigured,
  randomBase32Secret,
  updateUserAttributes,
} from "../../../../lib/app-mfa";
import { normalizeObjectTextFields } from "../../../../i18n/english-normalizer";
import {
  clearRateLimitIdentifier,
  rateLimitIdentifier,
} from "../../../../lib/redis_utility";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const username = body.username?.trim();
    const password = rawBody.password;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    const rateLimitScope = "mfa-setup";
    const rateLimitKey = username.toLowerCase();
    if (await rateLimitIdentifier(rateLimitScope, rateLimitKey, 5, 300)) {
      return NextResponse.json(
        { error: "Too many MFA setup attempts. Try again later." },
        { status: 429 },
      );
    }

    const passwordCheck = await verifyPasswordWithKeycloak(username, password);
    if (!passwordCheck.ok) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }
    await clearRateLimitIdentifier(rateLimitScope, rateLimitKey);

    const user = await findUserByUsername(username);
    if (!user?.id) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    if (user.emailVerified !== true) {
      return NextResponse.json(
        { error: "Verify your email before setting up MFA" },
        { status: 403 },
      );
    }

    if (isAppMfaConfigured(user)) {
      return NextResponse.json(
        { error: "MFA is already configured" },
        { status: 400 },
      );
    }

    const secret = randomBase32Secret();
    const issuer = process.env.APP_MFA_ISSUER || "IAM Platform";
    const otpauthUri = buildOtpAuthUri({ username, issuer, secret });

    await updateUserAttributes(user, {
      appMfaTempSecretEncrypted: encryptText(secret),
      appMfaTempSecretCreatedAt: new Date().toISOString(),
      appMfaConfigured: "false",
      onboardingStatus: "PENDING",
    });

    return NextResponse.json({
      otpauthUri,
      qrImageUrl: await buildQrImageUrl(otpauthUri),
      manualKey: secret,
      message:
        "Scan the QR code and enter the OTP from your authenticator app.",
    });
  } catch (error: unknown) {
    void logError("Failed to start MFA setup", {
      endpoint: "/api/public/mfa/setup",
      method: "POST",
      operation: "mfa.setup",
      error,
    });
    return NextResponse.json(
      { error: "Failed to start MFA setup" },
      { status: 500 },
    );
  }
}
