import { keycloakAdminFetch } from "./keycloak";
import { formatKeycloakError, getKeycloakError } from "./keycloak-error";

// Re-export so existing importers of keycloak-users continue to work.
export { formatKeycloakError, getKeycloakError };

export function readAttributeValue(attributes, key) {
  const value = attributes?.[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

const APP_USER_PROFILE_ATTRIBUTES = [
  "onboardingStatus",
  "emailVerificationStatus",
  "emailVerificationOtpHash",
  "emailVerificationLinkHash",
  "emailVerificationOtpExpiresAt",
  "passwordResetOtpHash",
  "passwordResetOtpExpiresAt",
  "appMfaConfigured",
  "appMfaTempSecretEncrypted",
  "appMfaTempSecretCreatedAt",
  "appMfaSecretEncrypted",
  "appMfaConfiguredAt",
  "mfaConfigured",
  "emailVerificationHash",
  "emailVerificationExpiresAt",
  "termsAcceptedAt",
  "passwordUpdatedAt",
  "sessionVersion",
  "locale",
  "preferredLocale",
  "identityProvider",
  "ssoUsernameRequired",
];

const APP_WRITABLE_PROFILE_ATTRIBUTES = [
  ...APP_USER_PROFILE_ATTRIBUTES,
  "username",
  "firstName",
  "lastName",
];

let appUserProfileReady = false;

function buildAppUserProfileAttribute(name) {
  return {
    name,
    displayName: name,
    permissions: {
      view: ["admin", "user"],
      edit: ["admin"],
    },
    multivalued: false,
  };
}

function normalizeAppUserProfileAttribute(attribute) {
  if (!APP_WRITABLE_PROFILE_ATTRIBUTES.includes(attribute.name)) return attribute;

  const appManaged = APP_USER_PROFILE_ATTRIBUTES.includes(attribute.name);

  return {
    ...attribute,
    permissions: {
      ...(attribute.permissions || {}),
      view: ["admin", "user"],
      edit: appManaged ? ["admin"] : ["admin", "user"],
    },
    multivalued: false,
  };
}

export async function ensureAppUserProfileAttributes(options = {}) {
  if (appUserProfileReady && !options.force) return;

  const response = await keycloakAdminFetch("/users/profile");

  if (!response.ok) {
    throw new Error(
      await getKeycloakError(response, "Failed to load Keycloak user profile"),
    );
  }

  const profile = await response.json();
  const attributes = Array.isArray(profile.attributes) ? profile.attributes : [];
  const normalizedAttributes = attributes.map(normalizeAppUserProfileAttribute);
  const existingNames = new Set(attributes.map((attribute) => attribute.name));
  const missingAttributes = APP_USER_PROFILE_ATTRIBUTES
    .filter((name) => !existingNames.has(name))
    .map(buildAppUserProfileAttribute);
  const attributesChanged =
    JSON.stringify(attributes) !== JSON.stringify(normalizedAttributes);

  if (missingAttributes.length === 0 && !attributesChanged) {
    appUserProfileReady = true;
    return;
  }

  const updateResponse = await keycloakAdminFetch("/users/profile", {
    method: "PUT",
    body: JSON.stringify({
      ...profile,
      attributes: [...normalizedAttributes, ...missingAttributes],
    }),
  });

  if (!updateResponse.ok) {
    throw new Error(
      await getKeycloakError(
        updateResponse,
        "Failed to update Keycloak user profile attributes",
      ),
    );
  }

  appUserProfileReady = true;
}

export function hasAppMfaConfigured(user) {
  return readAttributeValue(user?.attributes, "appMfaConfigured") === "true";
}

export function isEmailVerificationPending(user) {
  const onboardingStatus = readAttributeValue(user?.attributes, "onboardingStatus");
  const emailStatus = readAttributeValue(user?.attributes, "emailVerificationStatus");

  return Boolean(
    onboardingStatus === "PENDING" &&
      user?.emailVerified !== true &&
      emailStatus !== "VERIFIED",
  );
}

export function isAppMfaSetupPending(user) {
  const onboardingStatus = readAttributeValue(user?.attributes, "onboardingStatus");

  return Boolean(
    onboardingStatus === "PENDING" &&
      user?.emailVerified === true &&
      !hasAppMfaConfigured(user),
  );
}

export function getUserOnboardingStatus(user) {
  if (user?.enabled === false) return "DISABLED";

  if (Array.isArray(user?.requiredActions) && user.requiredActions.length > 0) {
    return "KEYCLOAK_REQUIRED_ACTIONS";
  }

  if (isEmailVerificationPending(user)) return "EMAIL_VERIFICATION_REQUIRED";
  if (isAppMfaSetupPending(user)) return "MFA_SETUP_REQUIRED";
  return "READY";
}

export async function findUserByUsername(username) {
  const response = await keycloakAdminFetch(
    `/users?username=${encodeURIComponent(username)}&exact=true`,
  );

  if (!response.ok) {
    throw new Error(await getKeycloakError(response, "Failed to find user"));
  }

  const users = await response.json();
  return Array.isArray(users) ? users[0] : null;
}


export async function findUserByEmail(email) {
  const response = await keycloakAdminFetch(
    `/users?email=${encodeURIComponent(email)}&exact=true`,
  );

  if (!response.ok) {
    throw new Error(await getKeycloakError(response, "Failed to find user by email"));
  }

  const users = await response.json();
  return Array.isArray(users) ? users[0] : null;
}

export async function findUserByUsernameOrEmail(identifier) {
  const value = String(identifier || "").trim();
  if (!value) return null;

  const byUsername = await findUserByUsername(value);
  if (byUsername?.id) return byUsername;

  if (value.includes("@")) {
    return findUserByEmail(value);
  }

  return null;
}

function buildUsernameFromEmail(email, includeDomain = false) {
  const [localPart, domain = ""] = String(email || "").toLowerCase().split("@");
  const source = includeDomain && domain ? `${localPart}.${domain}` : localPart;

  return source
    .replace(/[^a-z0-9._-]/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 60);
}

async function buildAvailableSsoUsername(email) {
  const candidates = [
    buildUsernameFromEmail(email),
    buildUsernameFromEmail(email, true),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const existing = await findUserByUsername(candidate);
    if (!existing?.id) return candidate;
  }

  const suffix = crypto.randomUUID().slice(0, 6);
  return `${(candidates[1] || candidates[0]).slice(0, 60 - suffix.length - 1)}.${suffix}`;
}

async function updateExistingSsoUser(user, provider) {
  const generatedUsername = buildUsernameFromEmail(user.email) === user.username ||
    buildUsernameFromEmail(user.email, true) === user.username;
  const usernameRequired =
    readAttributeValue(user.attributes, "ssoUsernameRequired") === "true" ||
    generatedUsername;
  const attributes = {
    ...(user.attributes || {}),
    onboardingStatus: ["READY"],
    emailVerificationStatus: ["VERIFIED"],
    appMfaConfigured: [readAttributeValue(user.attributes, "appMfaConfigured") || "false"],
    identityProvider: [provider],
    ssoUsernameRequired: [usernameRequired ? "true" : "false"],
  };

  const updateRes = await keycloakAdminFetch(`/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      ...user,
      enabled: user.enabled !== false,
      emailVerified: true,
      requiredActions: user.requiredActions || [],
      attributes,
    }),
  });

  if (!updateRes.ok) {
    throw new Error(await getKeycloakError(updateRes, "Failed to update SSO user"));
  }

  return {
    ...user,
    enabled: user.enabled !== false,
    emailVerified: true,
    requiredActions: user.requiredActions || [],
    attributes,
  };
}

async function createSsoUser({ email, name, provider }) {
  const [firstName = "", ...lastNameParts] = String(name || "").trim().split(/\s+/);
  const username = await buildAvailableSsoUsername(email);

  if (!username) {
    throw new Error("Google account did not return a usable email address");
  }

  await ensureAppUserProfileAttributes();

  const createRes = await keycloakAdminFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      username,
      firstName,
      lastName: lastNameParts.join(" "),
      email,
      enabled: true,
      emailVerified: true,
      requiredActions: [],
      attributes: {
        onboardingStatus: ["READY"],
        emailVerificationStatus: ["VERIFIED"],
        appMfaConfigured: ["false"],
        identityProvider: [provider],
        ssoUsernameRequired: ["true"],
      },
    }),
  });

  if (!createRes.ok) {
    throw new Error(await getKeycloakError(createRes, "Failed to create SSO user"));
  }

  const userId = createRes.headers.get("location")?.split("/").pop();
  if (!userId) {
    throw new Error("SSO user was created, but Keycloak did not return its ID");
  }

  return {
    id: userId,
    username,
    firstName,
    lastName: lastNameParts.join(" "),
    email,
    enabled: true,
    emailVerified: true,
    attributes: {
      onboardingStatus: ["READY"],
      emailVerificationStatus: ["VERIFIED"],
      appMfaConfigured: ["false"],
      identityProvider: [provider],
      ssoUsernameRequired: ["true"],
    },
  };
}

async function prepareSsoUser({ email, name, provider }) {
  const existing = await findUserByEmail(email);
  if (existing?.id) {
    return updateExistingSsoUser(existing, provider);
  }

  return createSsoUser({ email, name, provider });
}

async function ensureDefaultAppUserRole(userId) {
  const [currentRoles, appUserRole] = await Promise.all([
    getUserRealmRoles(userId),
    resolveRealmRoles(["app-user"]),
  ]);
  const currentNames = new Set(currentRoles.map((role) => role.name));
  const rolesToAdd = appUserRole.filter((role) => !currentNames.has(role.name));

  if (rolesToAdd.length === 0) return currentRoles;

  const roleRes = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
    { method: "POST", body: JSON.stringify(rolesToAdd) },
  );

  if (!roleRes.ok) {
    throw new Error(await getKeycloakError(roleRes, "Failed to assign app-user role"));
  }

  return [...currentRoles, ...rolesToAdd];
}

export async function ensureSsoUser({ email, name, provider = "google" }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Google account did not return an email address");
  }

  await ensureAppUserProfileAttributes();

  const user = await prepareSsoUser({
    email: normalizedEmail,
    name,
    provider,
  });

  if (user.enabled === false) {
    throw new Error("This account is disabled");
  }

  const roles = await ensureDefaultAppUserRole(user.id);

  return {
    id: user.id,
    name: user.firstName || user.username || name || normalizedEmail,
    email: user.email || normalizedEmail,
    needsUsername: readAttributeValue(user.attributes, "ssoUsernameRequired") === "true",
    sessionVersion: readAttributeValue(user.attributes, "sessionVersion") || "",
    roles: roles.map((role) => role.name),
  };
}

export async function getUserRealmRoles(userId, { effective = false } = {}) {
  const suffix = effective ? "/composite" : "";
  const response = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/role-mappings/realm${suffix}`,
  );

  if (!response.ok) {
    throw new Error(
      await getKeycloakError(response, "Failed to fetch user roles"),
    );
  }

  return response.json();
}

export async function resolveRealmRoles(roleNames) {
  const uniqueNames = [...new Set(roleNames)];

  return Promise.all(
    uniqueNames.map(async (roleName) => {
      const response = await keycloakAdminFetch(
        `/roles/${encodeURIComponent(roleName)}`,
      );

      if (response.status === 404) {
        throw new Error(`Realm role "${roleName}" does not exist`);
      }

      if (!response.ok) {
        throw new Error(
          await getKeycloakError(response, `Failed to load role "${roleName}"`),
        );
      }

      return response.json();
    }),
  );
}

export async function syncUserRealmRoles(userId, requestedRoles) {
  const [currentRoles, targetRoles] = await Promise.all([
    getUserRealmRoles(userId),
    resolveRealmRoles(requestedRoles),
  ]);

  const targetNames = new Set(targetRoles.map((role) => role.name));
  const currentNames = new Set(currentRoles.map((role) => role.name));
  const rolesToAdd = targetRoles.filter((role) => !currentNames.has(role.name));
  const rolesToRemove = currentRoles.filter(
    (role) => !targetNames.has(role.name),
  );
  const mappingPath = `/users/${encodeURIComponent(userId)}/role-mappings/realm`;

  if (rolesToAdd.length > 0) {
    const response = await keycloakAdminFetch(mappingPath, {
      method: "POST",
      body: JSON.stringify(rolesToAdd),
    });

    if (!response.ok) {
      throw new Error(
        await getKeycloakError(response, "Failed to assign user roles"),
      );
    }
  }

  if (rolesToRemove.length > 0) {
    const response = await keycloakAdminFetch(mappingPath, {
      method: "DELETE",
      body: JSON.stringify(rolesToRemove),
    });

    if (!response.ok) {
      throw new Error(
        await getKeycloakError(response, "Failed to remove user roles"),
      );
    }
  }
}

export async function getUserGroups(userId) {
  const response = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/groups?briefRepresentation=false&max=1000`,
  );

  if (!response.ok) {
    throw new Error(
      await getKeycloakError(response, "Failed to fetch user groups"),
    );
  }

  return response.json();
}

export async function syncUserGroups(userId, requestedGroupIds = []) {
  const currentGroups = await getUserGroups(userId);
  const targetIds = new Set(requestedGroupIds.filter(Boolean));
  const currentIds = new Set(currentGroups.map((group) => group.id));

  const groupsToAdd = [...targetIds].filter((groupId) => !currentIds.has(groupId));
  const groupsToRemove = currentGroups.filter((group) => !targetIds.has(group.id));

  for (const groupId of groupsToAdd) {
    const response = await keycloakAdminFetch(
      `/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupId)}`,
      { method: "PUT" },
    );

    if (!response.ok) {
      throw new Error(
        await getKeycloakError(response, "Failed to assign user group"),
      );
    }
  }

  for (const group of groupsToRemove) {
    const response = await keycloakAdminFetch(
      `/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(group.id)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      throw new Error(
        await getKeycloakError(response, "Failed to remove user group"),
      );
    }
  }
}
