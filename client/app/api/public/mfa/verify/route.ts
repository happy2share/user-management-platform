export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { findUserByUsername } from "../../../../lib/keycloak-users";
import { verifyPasswordWithKeycloak } from "../../../../lib/keycloak-password";
import {
  decryptText,
  readUserAttribute,
  updateUserAttributes,
  verifyTotp,
} from "../../../../lib/app-mfa";
import { normalizeObjectTextFields } from "../../../../i18n/english-normalizer";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const username = body.username?.trim();
    const password = rawBody.password;
    const otp = String(rawBody.otp || "").replace(/\D/g, "");

    if (!username || !password || !otp) {
      return NextResponse.json(
        { error: "Username, password and OTP are required" },
        { status: 400 },
      );
    }

    const passwordCheck = await verifyPasswordWithKeycloak(username, password);
    if (!passwordCheck.ok) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

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

    const encryptedTempSecret = readUserAttribute(
      user,
      "appMfaTempSecretEncrypted",
    );
    const createdAt = Date.parse(
      readUserAttribute(user, "appMfaTempSecretCreatedAt") || "",
    );
    const maxAgeMs =
      Number(process.env.APP_MFA_SETUP_MINUTES || 10) * 60_000;
    if (!encryptedTempSecret) {
      return NextResponse.json(
        { error: "Start MFA setup before verifying OTP" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(createdAt) || Date.now() - createdAt > maxAgeMs) {
      return NextResponse.json(
        { error: "MFA setup expired. Start setup again." },
        { status: 400 },
      );
    }

    const secret = decryptText(encryptedTempSecret);

    if (!verifyTotp(secret, otp)) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
    }

    await updateUserAttributes({
      ...user,
      requiredActions: (user.requiredActions || []).filter(
        (action: string) => action !== "CONFIGURE_TOTP",
      ),
    }, {
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
    void logError("Failed to verify MFA setup", {
      endpoint: "/api/public/mfa/verify",
      method: "POST",
      operation: "mfa.verify",
      error,
    });
    return NextResponse.json(
      { error: "Failed to verify MFA setup" },
      { status: 500 },
    );
  }
}
