import crypto from "crypto";
import { keycloakAdminFetch } from "./keycloak";
import { getKeycloakError } from "./keycloak-users";

export const ONBOARDING_REQUIRED_ACTIONS = [
  "TERMS_AND_CONDITIONS",
  "CONFIGURE_TOTP",
  "VERIFY_EMAIL",
  "UPDATE_PASSWORD",
];

export const ACTIVATION_ATTRIBUTE_DEFAULTS = {
  onboardingStatus: ["PENDING"],
  termsAccepted: ["false"],
  mfaConfigured: ["false"],
};

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getRequestOrigin(req) {
  return (
    req.headers.get("origin") ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function tokenExpiryIso(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function mergeAttributes(current = {}, patch = {}) {
  return {
    ...(current || {}),
    ...patch,
  };
}

export function buildActivationLink(req, token) {
  return `${getRequestOrigin(req)}/activate?token=${encodeURIComponent(token)}`;
}

export async function readUser(userId) {
  const response = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`);

  if (!response.ok) {
    throw new Error(await getKeycloakError(response, "Failed to read Keycloak user"));
  }

  return response.json();
}

export async function updateUser(userId, userPatch) {
  const current = await readUser(userId);
  const nextUser = {
    ...current,
    ...userPatch,
    attributes: mergeAttributes(current.attributes, userPatch.attributes),
  };

  const response = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify(nextUser),
  });

  if (!response.ok) {
    throw new Error(await getKeycloakError(response, "Failed to update Keycloak user"));
  }

  return nextUser;
}

export async function findUserByUsername(username) {
  const response = await keycloakAdminFetch(
    `/users?username=${encodeURIComponent(username)}&exact=true`,
  );

  if (!response.ok) {
    throw new Error(await getKeycloakError(response, "Failed to find Keycloak user"));
  }

  const users = await response.json();
  return users?.[0] || null;
}

export async function createActivationTokenForUser(userId, req) {
  const randomPart = crypto.randomBytes(32).toString("base64url");
  const token = `${userId}.${randomPart}`;

  await updateUser(userId, {
    attributes: {
      activationTokenHash: [hashValue(randomPart)],
      activationTokenExpiresAt: [tokenExpiryIso(24)],
      onboardingStatus: ["PENDING"],
    },
  });

  return {
    token,
    activationLink: buildActivationLink(req, token),
  };
}

export async function prepareUserForOnboarding(userId, req) {
  await updateUser(userId, {
    enabled: true,
    emailVerified: false,
    requiredActions: ONBOARDING_REQUIRED_ACTIONS,
    attributes: ACTIVATION_ATTRIBUTE_DEFAULTS,
  });

  return createActivationTokenForUser(userId, req);
}

export async function resolveActivationToken(token) {
  if (!token || typeof token !== "string") {
    throw new Error("Activation token is required");
  }

  const [userId, randomPart] = token.split(".");

  if (!userId || !randomPart) {
    throw new Error("Activation token is invalid");
  }

  const user = await readUser(userId);
  const attrs = user.attributes || {};
  const expectedHash = attrs.activationTokenHash?.[0];
  const expiresAt = attrs.activationTokenExpiresAt?.[0];

  if (!expectedHash || expectedHash !== hashValue(randomPart)) {
    throw new Error("Activation token is invalid");
  }

  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    throw new Error("Activation token has expired");
  }

  return { userId, user };
}

export function removeRequiredActionFromUser(user, action) {
  const requiredActions = (user.requiredActions || []).filter(
    (item) => item !== action,
  );
  return requiredActions;
}

export async function removeRequiredAction(userId, action, attributes = {}) {
  const user = await readUser(userId);
  return updateUser(userId, {
    requiredActions: removeRequiredActionFromUser(user, action),
    attributes,
  });
}

export async function resetUserPassword(userId, password, temporary = false) {
  const response = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "PUT",
      body: JSON.stringify({
        type: "password",
        value: password,
        temporary,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await getKeycloakError(response, "Failed to update password"));
  }
}

export async function getUserCredentials(userId) {
  const response = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/credentials`,
  );

  if (!response.ok) {
    throw new Error(await getKeycloakError(response, "Failed to read user credentials"));
  }

  return response.json();
}

export async function userHasOtpCredential(userId) {
  const credentials = await getUserCredentials(userId);
  return credentials.some((credential) => credential.type === "otp");
}

export function getActivationStatus(user, hasOtp = false) {
  const requiredActions = user.requiredActions || [];
  const attrs = user.attributes || {};

  const termsDone =
    attrs.termsAccepted?.[0] === "true" ||
    !requiredActions.includes("TERMS_AND_CONDITIONS");
  const passwordDone = !requiredActions.includes("UPDATE_PASSWORD");
  const emailDone = user.emailVerified === true && !requiredActions.includes("VERIFY_EMAIL");
  const mfaDone =
    hasOtp ||
    attrs.mfaConfigured?.[0] === "true" ||
    !requiredActions.includes("CONFIGURE_TOTP");

  let nextStep = "complete";
  if (!termsDone) nextStep = "terms";
  else if (!passwordDone) nextStep = "password";
  else if (!emailDone) nextStep = "email";
  else if (!mfaDone) nextStep = "mfa";

  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    requiredActions,
    onboardingStatus: attrs.onboardingStatus?.[0] || "PENDING",
    completed: {
      terms: termsDone,
      password: passwordDone,
      email: emailDone,
      mfa: mfaDone,
    },
    nextStep,
    complete: termsDone && passwordDone && emailDone && mfaDone,
  };
}

export function createEmailVerificationToken(userId) {
  const randomPart = crypto.randomBytes(32).toString("base64url");
  return {
    raw: `${userId}.${randomPart}`,
    randomPart,
    hash: hashValue(randomPart),
    expiresAt: tokenExpiryIso(2),
  };
}

export async function storeEmailVerificationToken(userId) {
  const token = createEmailVerificationToken(userId);

  await updateUser(userId, {
    attributes: {
      emailVerificationHash: [token.hash],
      emailVerificationExpiresAt: [token.expiresAt],
    },
  });

  return token.raw;
}

export async function verifyEmailToken(emailToken) {
  if (!emailToken || typeof emailToken !== "string") {
    throw new Error("Email verification token is required");
  }

  const [userId, randomPart] = emailToken.split(".");
  if (!userId || !randomPart) {
    throw new Error("Email verification token is invalid");
  }

  const user = await readUser(userId);
  const attrs = user.attributes || {};
  const expectedHash = attrs.emailVerificationHash?.[0];
  const expiresAt = attrs.emailVerificationExpiresAt?.[0];

  if (!expectedHash || expectedHash !== hashValue(randomPart)) {
    throw new Error("Email verification token is invalid");
  }

  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    throw new Error("Email verification token has expired");
  }

  await updateUser(userId, {
    emailVerified: true,
    requiredActions: removeRequiredActionFromUser(user, "VERIFY_EMAIL"),
    attributes: {
      emailVerifiedByPortal: ["true"],
      emailVerifiedAt: [new Date().toISOString()],
      emailVerificationHash: [],
      emailVerificationExpiresAt: [],
    },
  });

  return userId;
}
