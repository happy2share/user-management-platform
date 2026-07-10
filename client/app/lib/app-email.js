import crypto from "crypto";
import net from "net";
import tls from "tls";

import { keycloakAdminFetch } from "./keycloak";
import {
  ensureAppUserProfileAttributes,
  findUserByUsernameOrEmail,
} from "./keycloak-users";

function hashValue(value) {
  const pepper = process.env.APP_EMAIL_OTP_PEPPER || process.env.NEXTAUTH_SECRET;
  if (!pepper) throw new Error("APP_EMAIL_OTP_PEPPER or NEXTAUTH_SECRET is required");
  return crypto.createHmac("sha256", pepper).update(String(value)).digest("hex");
}

function assertSafeMailValue(value, label) {
  const clean = String(value || "");
  if (!clean || /[\r\n]/.test(clean)) throw new Error(`Invalid SMTP ${label}`);
  return clean;
}

function buildEmailOtpHash(userId, otp) {
  return hashValue(`${userId}:${String(otp).replace(/\D/g, "")}`);
}

function buildEmailLinkTokenHash(userId, token) {
  return hashValue(`${userId}:${String(token)}`);
}

function generateEmailOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

const APP_MANAGED_REQUIRED_ACTIONS = new Set(["VERIFY_EMAIL", "CONFIGURE_TOTP"]);

function removeAppManagedRequiredActions(requiredActions = []) {
  return (requiredActions || []).filter(
    (action) => !APP_MANAGED_REQUIRED_ACTIONS.has(action),
  );
}

function getBaseUrl() {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function buildVerificationPageLink(user, token) {
  const username = user?.username || "";
  const params = new URLSearchParams({ username });
  if (token) params.set("token", token);
  return `${getBaseUrl()}/verify-email?${params.toString()}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatExpiry(expiresAt) {
  if (!expiresAt) return "";

  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(expiresAt));
  } catch {
    return expiresAt;
  }
}

function readSmtpConfig() {
  const host = process.env.APP_SMTP_HOST;
  const port = Number(process.env.APP_SMTP_PORT || 587);
  const user = process.env.APP_SMTP_USER;
  const pass = process.env.APP_SMTP_PASS;
  const from = process.env.APP_SMTP_FROM || user;
  const secure = String(process.env.APP_SMTP_SECURE || "false") === "true" || port === 465;

  if (!host || !from) return null;
  return { host, port, user, pass, from, secure };
}

function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error("SMTP response timed out"));
    }, Number(process.env.APP_SMTP_TIMEOUT_MS || 10_000));

    function cleanup() {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onData(chunk) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";

      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    }

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function sendCommand(socket, command, expectedCodes = [250], sensitive = false) {
  socket.write(`${command}\r\n`);
  const response = await readLine(socket);
  const code = Number(response.slice(0, 3));

  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP command failed (${sensitive ? "[REDACTED]" : command}): ${response}`);
  }

  return response;
}

function connectSmtp(config) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect(config.port, config.host, { servername: config.host })
      : net.connect(config.port, config.host);

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("SMTP connection timed out"));
    }, Number(process.env.APP_SMTP_TIMEOUT_MS || 10_000));
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.once(config.secure ? "secureConnect" : "connect", async () => {
      try {
        await readLine(socket);
        clearTimeout(timeout);
        resolve(socket);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
}

async function upgradeToTls(socket, config) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: config.host,
    });

    const timeout = setTimeout(() => {
      secureSocket.destroy();
      reject(new Error("SMTP TLS upgrade timed out"));
    }, Number(process.env.APP_SMTP_TIMEOUT_MS || 10_000));
    secureSocket.once("secureConnect", () => {
      clearTimeout(timeout);
      resolve(secureSocket);
    });
    secureSocket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function buildVerificationEmailTemplate({ name, otp, verificationPageLink, expiresAt }) {
  const safeName = escapeHtml(name || "there");
  const safeOtp = escapeHtml(otp);
  const safeLink = escapeHtml(verificationPageLink);
  const safeExpiry = escapeHtml(formatExpiry(expiresAt));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Complete registration</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;margin:0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:0;box-shadow:0 14px 36px rgba(15,23,42,0.06);">
            <tr>
              <td style="padding:28px 36px 18px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      <div style="font-size:30px;line-height:1;font-weight:800;letter-spacing:0;color:#111827;">iam</div>
                      <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;color:#64748b;text-transform:uppercase;margin-top:4px;">Platform</div>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <a href="${safeLink}" style="display:inline-block;border:1px solid #111827;border-radius:4px;color:#111827;text-decoration:none;font-size:14px;font-weight:700;padding:12px 20px;">Go to IAM</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 36px 0;">
                <h1 style="margin:0 0 16px;font-size:34px;line-height:1.15;font-weight:800;color:#0f1230;">Complete registration</h1>
                <p style="margin:0 0 8px;font-size:17px;line-height:1.45;color:#4b5563;">Hi ${safeName},</p>
                <p style="margin:0 0 28px;font-size:17px;line-height:1.45;color:#4b5563;">Use this code to complete your registration at IAM Platform.</p>
                <div style="background:#f4f6fa;border:1px solid #eef2f7;padding:30px 20px;text-align:center;margin:0 0 26px;">
                  <div style="font-size:40px;line-height:1;font-weight:800;letter-spacing:2px;color:#0f1230;">${safeOtp}</div>
                </div>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.45;color:#4b5563;">From your mobile device, use the code to confirm your email.</p>
                <p style="margin:0 0 12px;font-size:16px;line-height:1.45;color:#4b5563;"><strong>Or click this button to confirm your email:</strong></p>
                <p style="margin:0 0 26px;">
                  <a href="${safeLink}" style="display:inline-block;background:#2f7cf6;color:#ffffff;text-decoration:none;border-radius:4px;font-size:16px;font-weight:800;padding:17px 34px;">Confirm your email</a>
                </p>
                <p style="margin:0 0 28px;font-size:15px;line-height:1.5;color:#6b7280;">This code expires at ${safeExpiry}. If you did not create an account in IAM Platform, please ignore this message.</p>
              </td>
            </tr>
          </table>
          <p style="max-width:520px;margin:28px auto 0;font-size:13px;line-height:1.45;text-align:center;color:#475569;">You have received this notification because you signed up for IAM Platform.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildMessage({ from, to, subject, text, html }) {
  const boundary = `iam-platform-${crypto.randomBytes(12).toString("hex")}`;

  if (html) {
    return [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      text.replace(/^\./gm, ".."),
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      html.replace(/^\./gm, ".."),
      "",
      `--${boundary}--`,
    ].join("\r\n");
  }

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text.replace(/^\./gm, ".."),
  ].join("\r\n");
}

async function sendSmtpMail({ to, subject, text, html }) {
  const config = readSmtpConfig();

  if (!config) {
    return { sent: false, skipped: true, reason: "APP_SMTP_HOST is not configured" };
  }

  const safeFrom = assertSafeMailValue(config.from, "sender");
  const safeTo = assertSafeMailValue(to, "recipient");
  const safeSubject = assertSafeMailValue(subject, "subject");

  let socket = await connectSmtp(config);

  try {
    await sendCommand(socket, "EHLO localhost", [250]);

    if (!config.secure) {
      await sendCommand(socket, "STARTTLS", [220]);
      socket = await upgradeToTls(socket, config);
      await sendCommand(socket, "EHLO localhost", [250]);
    }

    if (config.user && config.pass) {
      await sendCommand(socket, "AUTH LOGIN", [334], true);
      await sendCommand(socket, Buffer.from(config.user).toString("base64"), [334], true);
      await sendCommand(socket, Buffer.from(config.pass).toString("base64"), [235], true);
    }

    await sendCommand(socket, `MAIL FROM:<${safeFrom}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${safeTo}>`, [250, 251]);
    await sendCommand(socket, "DATA", [354]);
    socket.write(`${buildMessage({ from: safeFrom, to: safeTo, subject: safeSubject, text, html })}\r\n.\r\n`);
    const dataResponse = await readLine(socket);
    const dataCode = Number(String(dataResponse).slice(0, 3));
    if (dataCode !== 250) {
      throw new Error(`SMTP DATA failed: ${dataResponse}`);
    }
    await sendCommand(socket, "QUIT", [221]);

    return { sent: true, skipped: false };
  } finally {
    socket.end();
  }
}

export async function createEmailVerificationOtp(user) {
  if (!user?.id) throw new Error("User ID is required");

  await ensureAppUserProfileAttributes();

  const otp = generateEmailOtp();
  const minutesRaw = Number.parseInt(process.env.EMAIL_VERIFICATION_TOKEN_MINUTES || "10", 10);
  const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 10;
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const linkToken = crypto.randomBytes(32).toString("base64url");

  const attributes = {
    ...(user.attributes || {}),
    emailVerificationOtpHash: [buildEmailOtpHash(user.id, otp)],
    emailVerificationLinkHash: [buildEmailLinkTokenHash(user.id, linkToken)],
    emailVerificationOtpExpiresAt: [expiresAt],
    emailVerificationStatus: ["PENDING"],
    onboardingStatus: ["PENDING"],
  };

  // Clean old link-token attributes from the previous build, if they exist.
  delete attributes.emailVerificationTokenHash;
  delete attributes.emailVerificationTokenExpiresAt;

  const response = await keycloakAdminFetch(`/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: JSON.stringify({ ...user, emailVerified: false, attributes }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to store email verification OTP");
  }

  const checkResponse = await keycloakAdminFetch(
    `/users/${encodeURIComponent(user.id)}`,
  );

  if (!checkResponse.ok) {
    const text = await checkResponse.text();
    throw new Error(text || "Failed to verify stored email verification OTP");
  }

  const savedUser = await checkResponse.json();
  const savedOtpHash = Array.isArray(savedUser.attributes?.emailVerificationOtpHash)
    ? savedUser.attributes.emailVerificationOtpHash[0]
    : savedUser.attributes?.emailVerificationOtpHash;

  if (savedOtpHash !== attributes.emailVerificationOtpHash[0]) {
    throw new Error(
      'Keycloak did not persist user attribute "emailVerificationOtpHash". Add the IAM Platform app attributes to Realm settings > User profile.',
    );
  }

  return {
    otp,
    linkToken,
    expiresAt,
    verificationPageLink: buildVerificationPageLink(user, linkToken),
  };
}

export async function sendEmailVerification(user) {
  if (!user?.email) {
    throw new Error("User email is required before sending verification email");
  }

  const verification = await createEmailVerificationOtp(user);
  const displayName = user.firstName || user.username || "user";
  const text = [
    `Hello ${displayName},`,
    "",
    "Use this code to complete your registration at IAM Platform.",
    "",
    verification.otp,
    "",
    `Confirm your email here: ${verification.verificationPageLink}`,
    "",
    `This code expires at ${verification.expiresAt}.`,
    "",
    "If you did not request this account, ignore this email.",
  ].join("\n");
  const html = buildVerificationEmailTemplate({
    name: displayName,
    otp: verification.otp,
    verificationPageLink: verification.verificationPageLink,
    expiresAt: verification.expiresAt,
  });

  const mail = await sendSmtpMail({
    to: user.email,
    subject: "Your IAM Platform email verification code",
    text,
    html,
  });
  const exposeLocalCode =
    !mail.sent &&
    process.env.NODE_ENV !== "production" &&
    process.env.APP_EMAIL_EXPOSE_LOCAL_OTP === "true";

  return {
    emailSent: mail.sent,
    emailSkipped: mail.skipped,
    warning: mail.reason,
    verificationPageLink: exposeLocalCode
      ? verification.verificationPageLink
      : undefined,
    localOtpCode: exposeLocalCode ? verification.otp : undefined,
  };
}

async function markEmailVerified(user) {
  const attributes = {
    ...(user.attributes || {}),
    emailVerificationStatus: ["VERIFIED"],
  };
  delete attributes.emailVerificationOtpHash;
  delete attributes.emailVerificationLinkHash;
  delete attributes.emailVerificationOtpExpiresAt;
  delete attributes.emailVerificationTokenHash;
  delete attributes.emailVerificationTokenExpiresAt;

  const updateRes = await keycloakAdminFetch(`/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      ...user,
      emailVerified: true,
      requiredActions: removeAppManagedRequiredActions(user.requiredActions),
      attributes,
    }),
  });

  if (!updateRes.ok) {
    const text = await updateRes.text();
    throw new Error(text || "Failed to verify email");
  }
}

/**
 * @param {{
 *   username?: unknown;
 *   email?: unknown;
 *   identifier?: unknown;
 *   otp?: unknown;
 *   token?: unknown;
 *   forceCheck?: boolean;
 * }} input
 */
export async function verifyEmailOtp({ username, email, identifier, otp, token, forceCheck = false }) {
  const cleanIdentifier = String(identifier || username || email || "").trim();
  const cleanOtp = String(otp || "").replace(/\D/g, "");
  const cleanToken = String(token || "").trim();

  if (!cleanIdentifier || (!/^\d{6}$/.test(cleanOtp) && !cleanToken)) {
    throw new Error("Enter username/email and the 6-digit email OTP");
  }

  const user = await findUserByUsernameOrEmail(cleanIdentifier);

  if (!user?.id) {
    throw new Error("Invalid email verification code");
  }

  if (!forceCheck && user.emailVerified === true) {
    const requiredActions = removeAppManagedRequiredActions(user.requiredActions);

    if ((user.requiredActions || []).length !== requiredActions.length) {
      await keycloakAdminFetch(`/users/${encodeURIComponent(user.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          ...user,
          requiredActions,
          attributes: {
            ...(user.attributes || {}),
            emailVerificationStatus: ["VERIFIED"],
          },
        }),
      });
    }

    return { username: user.username, email: user.email, userId: user.id, enabled: user.enabled, alreadyVerified: true };
  }

  const savedOtpHash = Array.isArray(user.attributes?.emailVerificationOtpHash)
    ? user.attributes.emailVerificationOtpHash[0]
    : user.attributes?.emailVerificationOtpHash;
  const savedLinkHash = Array.isArray(user.attributes?.emailVerificationLinkHash)
    ? user.attributes.emailVerificationLinkHash[0]
    : user.attributes?.emailVerificationLinkHash;
  const expiresAt = Array.isArray(user.attributes?.emailVerificationOtpExpiresAt)
    ? user.attributes.emailVerificationOtpExpiresAt[0]
    : user.attributes?.emailVerificationOtpExpiresAt;

  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) < Date.now()) {
    throw new Error("Email verification code expired. Please request a new code.");
  }

  const otpMatches = cleanOtp && savedOtpHash === buildEmailOtpHash(user.id, cleanOtp);
  const tokenMatches =
    cleanToken && savedLinkHash === buildEmailLinkTokenHash(user.id, cleanToken);

  if (!otpMatches && !tokenMatches) {
    throw new Error("Invalid email verification code");
  }

  await markEmailVerified(user);

  return { username: user.username, email: user.email, userId: user.id, enabled: user.enabled, alreadyVerified: false };
}
