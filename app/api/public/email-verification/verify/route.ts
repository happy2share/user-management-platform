export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { verifyEmailOtp } from "../../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../../lib/english-normalizer";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const result = await verifyEmailOtp({
      username: body.username,
      email: rawBody.email,
      identifier: rawBody.identifier,
      otp: rawBody.otp || rawBody.code,
    });

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
        error: error instanceof Error ? error.message : "Failed to verify email OTP",
      },
      { status: 400 },
    );
  }
}
