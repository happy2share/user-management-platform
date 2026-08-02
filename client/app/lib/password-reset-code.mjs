import crypto from "node:crypto";

function resetPepper() {
  const pepper = process.env.APP_EMAIL_OTP_PEPPER || process.env.NEXTAUTH_SECRET;
  if (!pepper) throw new Error("APP_EMAIL_OTP_PEPPER or NEXTAUTH_SECRET is required");
  return pepper;
}

export function passwordResetOtpHash(userId, otp) {
  return crypto
    .createHmac("sha256", resetPepper())
    .update(`password-reset:${userId}:${String(otp).replace(/\D/g, "")}`)
    .digest("hex");
}

export function passwordResetOtpMatches(
  userId,
  otp,
  savedHash,
  expiresAt,
  now = Date.now(),
) {
  if (!savedHash || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) return false;
  if (Date.parse(expiresAt) < now) return false;

  const expected = Buffer.from(passwordResetOtpHash(userId, otp));
  const saved = Buffer.from(String(savedHash));
  return expected.length === saved.length && crypto.timingSafeEqual(expected, saved);
}
