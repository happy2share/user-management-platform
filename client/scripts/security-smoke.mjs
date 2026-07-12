import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.APP_EMAIL_OTP_PEPPER = "security-smoke-pepper";
const { passwordResetOtpMatches } = await import("../app/lib/password-reset-code.mjs");

const userId = "user-1";
const otp = "123456";
const hash = crypto
  .createHmac("sha256", process.env.APP_EMAIL_OTP_PEPPER)
  .update(`password-reset:${userId}:${otp}`)
  .digest("hex");
const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

assert.equal(passwordResetOtpMatches(userId, otp, hash, future), true);
assert.equal(passwordResetOtpMatches(userId, "654321", hash, future), false);
assert.equal(passwordResetOtpMatches(userId, otp, hash, past), false);
