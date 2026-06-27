export const runtime = "nodejs";
import { NextResponse } from "next/server";
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
import { normalizeObjectTextFields } from "../../../../lib/english-normalizer";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const username = body.username?.trim();
    const password = rawBody.password;

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const passwordCheck = await verifyPasswordWithKeycloak(username, password);
    if (!passwordCheck.ok) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const user = await findUserByUsername(username);
    if (!user?.id) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    if (user.emailVerified !== true) {
      return NextResponse.json({ error: "Verify your email before setting up MFA" }, { status: 403 });
    }

    if (isAppMfaConfigured(user)) {
      return NextResponse.json({ error: "MFA is already configured" }, { status: 400 });
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
      message: "Scan the QR code and enter the OTP from your authenticator app.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start MFA setup" },
      { status: 500 },
    );
  }
}
