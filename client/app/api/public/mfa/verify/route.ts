export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { findUserByUsername } from "../../../../lib/keycloak-users";
import { verifyPasswordWithKeycloak } from "../../../../lib/keycloak-password";
import {
  decryptText,
  readUserAttribute,
  updateUserAttributes,
  verifyTotp,
} from "../../../../lib/app-mfa";
import { normalizeObjectTextFields } from "../../../../lib/english-normalizer";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const username = body.username?.trim();
    const password = rawBody.password;
    const otp = String(rawBody.otp || "").replace(/\D/g, "");

    if (!username || !password || !otp) {
      return NextResponse.json({ error: "Username, password and OTP are required" }, { status: 400 });
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

    const encryptedTempSecret = readUserAttribute(user, "appMfaTempSecretEncrypted");
    if (!encryptedTempSecret) {
      return NextResponse.json({ error: "Start MFA setup before verifying OTP" }, { status: 400 });
    }

    const secret = decryptText(encryptedTempSecret);

    if (!verifyTotp(secret, otp)) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
    }

    await updateUserAttributes(user, {
      appMfaSecretEncrypted: encryptedTempSecret,
      appMfaConfigured: "true",
      appMfaConfiguredAt: new Date().toISOString(),
      appMfaTempSecretEncrypted: "",
      appMfaTempSecretCreatedAt: "",
      onboardingStatus: "COMPLETED",
    });

    return NextResponse.json({
      mfaConfigured: true,
      message: "MFA setup completed. You can now login.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify MFA setup" },
      { status: 500 },
    );
  }
}
