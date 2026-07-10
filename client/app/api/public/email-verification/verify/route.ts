export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { verifyEmailOtp } from "../../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../../i18n/english-normalizer";
import {
  clearRateLimitIdentifier,
  rateLimitIdentifier,
} from "../../../../lib/redis_utility";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const identifier = String(
      body.username || rawBody.email || rawBody.identifier || "",
    ).trim().toLowerCase();
    if (await rateLimitIdentifier("email-verify", identifier || "missing", 5, 300)) {
      return NextResponse.json(
        { verified: false, error: "Too many verification attempts. Try again later." },
        { status: 429 },
      );
    }
    const result = await verifyEmailOtp({
      username: body.username,
      email: rawBody.email,
      identifier: rawBody.identifier,
      otp: rawBody.otp || rawBody.code,
      token: rawBody.token,
    });
    await clearRateLimitIdentifier("email-verify", identifier);

    return NextResponse.json({
      verified: true,
      message: result.alreadyVerified
        ? "Email is already verified. Return to IAM Platform and continue."
        : "Email verified successfully. Return to IAM Platform and complete MFA setup.",
      ...result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        verified: false,
        error:
          error instanceof Error ? error.message : "Failed to verify email OTP",
      },
      { status: 400 },
    );
  }
}
