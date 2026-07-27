import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

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

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const landingAuth = await source("../app/components/auth/LandingAuth.jsx");
const mfaSetupRoute = await source("../app/api/public/mfa/setup/route.ts");
const auth = await source("../app/lib/auth.ts");
const redisUtility = await source("../app/lib/redis_utility.ts");
const passwordCheckRoute = await source(
  "../app/api/public/password-check/route.ts",
);
const rootGitignore = await source("../../.gitignore");

assert.match(landingAuth, /onClick=\{\(\) => handleMfaSetupStart\(\)\}/);
assert.match(mfaSetupRoute, /qrImageUrl: await buildQrImageUrl\(otpauthUri\)/);
assert.match(auth, /effective: true/);
assert.match(redisUtility, /results\.length < expectedResponses/);
assert.match(redisUtility, /!userId && ip === "unknown"/);
assert.doesNotMatch(passwordCheckRoute, /nativeMfaConfigured/);
assert.equal(rootGitignore.endsWith("\n\n"), false);
