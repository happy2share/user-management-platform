import crypto from "crypto";
import net from "net";
import tls from "tls";

import { keycloakAdminFetch } from "./keycloak";
import { findUserByUsernameOrEmail, getKeycloakError } from "./keycloak-users";

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function buildEmailOtpHash(userId, otp) {
  return hashValue(`${userId}:${String(otp).replace(/\D/g, "")}`);
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

function buildVerificationPageLink(user) {
  const username = user?.username || "";
  return `${getBaseUrl()}/verify-email?username=${encodeURIComponent(username)}`;
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

    function cleanup() {
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

async function sendCommand(socket, command, expectedCodes = [250]) {
  socket.write(`${command}\r\n`);
  const response = await readLine(socket);
  const code = Number(response.slice(0, 3));

  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP command failed (${command}): ${response}`);
  }

  return response;
}

function connectSmtp(config) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect(config.port, config.host, { servername: config.host })
      : net.connect(config.port, config.host);

    socket.once("error", reject);
    socket.once(config.secure ? "secureConnect" : "connect", async () => {
      try {
        await readLine(socket);
        resolve(socket);
      } catch (error) {
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

    secureSocket.once("secureConnect", () => resolve(secureSocket));
    secureSocket.once("error", reject);
  });
}

function buildMessage({ from, to, subject, text }) {
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

async function sendSmtpMail({ to, subject, text }) {
  const config = readSmtpConfig();

  if (!config) {
    return { sent: false, skipped: true, reason: "APP_SMTP_HOST is not configured" };
  }

  let socket = await connectSmtp(config);

  try {
    await sendCommand(socket, "EHLO localhost", [250]);

    if (!config.secure) {
      await sendCommand(socket, "STARTTLS", [220]);
      socket = await upgradeToTls(socket, config);
      await sendCommand(socket, "EHLO localhost", [250]);
    }

    if (config.user && config.pass) {
      await sendCommand(socket, "AUTH LOGIN", [334]);
      await sendCommand(socket, Buffer.from(config.user).toString("base64"), [334]);
      await sendCommand(socket, Buffer.from(config.pass).toString("base64"), [235]);
    }

    await sendCommand(socket, `MAIL FROM:<${config.from}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
    await sendCommand(socket, "DATA", [354]);
    socket.write(`${buildMessage({ from: config.from, to, subject, text })}\r\n.\r\n`);
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

  const otp = generateEmailOtp();
  const expiresAt = new Date(
    Date.now() + Number(process.env.EMAIL_VERIFICATION_TOKEN_MINUTES || 10) * 60_000,
  ).toISOString();

  const attributes = {
    ...(user.attributes || {}),
    emailVerificationOtpHash: [buildEmailOtpHash(user.id, otp)],
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
    throw new Error(
      await getKeycloakError(response, "Failed to store email verification OTP"),
    );
  }

  return {
    otp,
    expiresAt,
    verificationPageLink: buildVerificationPageLink(user),
  };
}

export async function sendEmailVerification(user) {
  if (!user?.email) {
    throw new Error("User email is required before sending verification email");
  }

  const verification = await createEmailVerificationOtp(user);
  const mail = await sendSmtpMail({
    to: user.email,
    subject: "Your IAM Platform email verification code",
    text: [
      `Hello ${user.firstName || user.username || "user"},`,
      "",
      "Your IAM Platform email verification code is:",
      "",
      verification.otp,
      "",
      `This code expires at ${verification.expiresAt}.`,
      "",
      "Enter this code in IAM Platform to verify your email.",
      "",
      "If you did not request this account, ignore this email.",
    ].join("\n"),
  });

  return {
    ...verification,
    emailSent: mail.sent,
    emailSkipped: mail.skipped,
    warning: mail.reason,
    // Returned only for local testing when SMTP is not configured.
    localOtpCode: mail.sent ? undefined : verification.otp,
    link: verification.verificationPageLink,
  };
}

export async function verifyEmailOtp({ username, email, identifier, otp }) {
  const cleanIdentifier = String(identifier || username || email || "").trim();
  const cleanOtp = String(otp || "").replace(/\D/g, "");

  if (!cleanIdentifier || !/^\d{6}$/.test(cleanOtp)) {
    throw new Error("Enter username/email and the 6-digit email OTP");
  }

  const user = await findUserByUsernameOrEmail(cleanIdentifier);

  if (!user?.id) {
    throw new Error("Invalid email verification code");
  }

  if (user.emailVerified === true) {
    const requiredActions = removeAppManagedRequiredActions(user.requiredActions);

    if ((user.requiredActions || []).length !== requiredActions.length) {
      const response = await keycloakAdminFetch(`/users/${encodeURIComponent(user.id)}`, {
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

      if (!response.ok) {
        throw new Error(
          await getKeycloakError(response, "Failed to update verified user"),
        );
      }
    }

    return { username: user.username, email: user.email, alreadyVerified: true };
  }

  const savedHash = Array.isArray(user.attributes?.emailVerificationOtpHash)
    ? user.attributes.emailVerificationOtpHash[0]
    : user.attributes?.emailVerificationOtpHash;
  const expiresAt = Array.isArray(user.attributes?.emailVerificationOtpExpiresAt)
    ? user.attributes.emailVerificationOtpExpiresAt[0]
    : user.attributes?.emailVerificationOtpExpiresAt;

  if (!savedHash || savedHash !== buildEmailOtpHash(user.id, cleanOtp)) {
    throw new Error("Invalid email verification code");
  }

  if (expiresAt && Date.parse(expiresAt) < Date.now()) {
    throw new Error("Email verification code expired. Please request a new code.");
  }

  const attributes = {
    ...(user.attributes || {}),
    emailVerificationStatus: ["VERIFIED"],
  };
  delete attributes.emailVerificationOtpHash;
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
    throw new Error(await getKeycloakError(updateRes, "Failed to verify email"));
  }

  return { username: user.username, email: user.email, alreadyVerified: false };
}
