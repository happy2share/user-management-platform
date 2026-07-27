import crypto from "crypto";
import QRCode from "qrcode";

import { keycloakAdminFetch } from "./keycloak";
import { ensureAppUserProfileAttributes } from "./keycloak-users";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function readUserAttribute(user, key) {
  const value = user?.attributes?.[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function isAppMfaConfigured(user) {
  return readUserAttribute(user, "appMfaConfigured") === "true";
}

function getEncryptionKey() {
  const source = process.env.APP_MFA_ENCRYPTION_KEY ||
    (process.env.NODE_ENV === "production" ? "" : process.env.NEXTAUTH_SECRET);

  if (!source) {
    throw new Error("APP_MFA_ENCRYPTION_KEY is required");
  }

  return crypto.createHash("sha256").update(source).digest();
}

export function encryptText(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptText(encryptedText) {
  const [ivText, tagText, cipherText] = String(encryptedText || "").split(".");

  if (!ivText || !tagText || !cipherText) {
    throw new Error("Invalid encrypted MFA secret");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(cipherText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function randomBase32Secret(length = 20) {
  const bytes = crypto.randomBytes(length);
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output.slice(0, 32);
}

function base32ToBuffer(secret) {
  const clean = String(secret || "")
    .replace(/=+$/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotp(secret, timeStep = 30, digits = 6, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / timeStep);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto
    .createHmac("sha1", base32ToBuffer(secret))
    .update(counterBuffer)
    .digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function verifyTotp(secret, token, { window = 1 } = {}) {
  const cleanToken = String(token || "").replace(/\D/g, "");
  if (!/^\d{6,8}$/.test(cleanToken)) return false;

  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const timestamp = now + offset * 30_000;
    const expected = generateTotp(secret, 30, cleanToken.length, timestamp);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanToken))) {
      return true;
    }
  }

  return false;
}

export function buildOtpAuthUri({ username, issuer = "IAM Platform", secret }) {
  const label = `${issuer}:${username}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function buildQrImageUrl(otpauthUri) {
  return QRCode.toDataURL(otpauthUri, { width: 220, margin: 1 });
}

export async function updateUserAttributes(user, updates) {
  if (!user?.id) throw new Error("User ID is required");

  await ensureAppUserProfileAttributes();

  const nextAttributes = {
    ...(user.attributes || {}),
    ...Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [
        key,
        Array.isArray(value) ? value : [String(value)],
      ]),
    ),
  };

  const response = await keycloakAdminFetch(`/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      ...user,
      attributes: nextAttributes,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to update user attributes");
  }

  const expectedAttributes = Object.entries(updates)
    .map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : String(value),
    ])
    .filter(([, value]) => value);

  if (expectedAttributes.length > 0) {
    const checkResponse = await keycloakAdminFetch(
      `/users/${encodeURIComponent(user.id)}`,
    );

    if (!checkResponse.ok) {
      const text = await checkResponse.text();
      throw new Error(text || "Failed to verify user attributes");
    }

    const savedUser = await checkResponse.json();
    const missingAttribute = expectedAttributes.find(([key, value]) => {
      const savedValue = readUserAttribute(savedUser, key);
      return savedValue !== value;
    });

    if (missingAttribute) {
      throw new Error(
        `Keycloak did not persist user attribute "${missingAttribute[0]}". Add it to Realm settings > User profile.`,
      );
    }
  }

  return nextAttributes;
}

export function getEncryptedAppMfaSecret(user) {
  return readUserAttribute(user, "appMfaSecretEncrypted");
}

export function verifyUserAppOtp(user, otp) {
  if (!isAppMfaConfigured(user)) return false;

  const encryptedSecret = getEncryptedAppMfaSecret(user);
  if (!encryptedSecret) return false;

  const secret = decryptText(encryptedSecret);
  return verifyTotp(secret, otp);
}
