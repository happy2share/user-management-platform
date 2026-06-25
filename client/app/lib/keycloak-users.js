import { keycloakAdminFetch } from "./keycloak";

const KEYCLOAK_ERROR_MESSAGES = {
  invalidPasswordMinLengthMessage: "Password is too short.",
  invalidPasswordMinDigitsMessage: "Password must include more numbers.",
  invalidPasswordMinLowerCaseCharsMessage: "Password must include a lowercase letter.",
  invalidPasswordMinUpperCaseCharsMessage: "Password must include an uppercase letter.",
  invalidPasswordMinSpecialCharsMessage: "Password must include a special character.",
  invalidPasswordNotUsernameMessage: "Password cannot be the same as the username.",
  invalidPasswordRegexPatternMessage: "Password does not meet the required format.",
  invalidPasswordHistoryMessage: "Choose a password you have not used before.",
  userExistsError: "That username is already taken.",
  usernameExistsMessage: "That username is already taken.",
  emailExistsMessage: "That email is already registered.",
}

export function formatKeycloakError(message, fallback = "Something went wrong") {
  if (!message) return fallback;

  const cleanMessage = String(message).trim();
  if (KEYCLOAK_ERROR_MESSAGES[cleanMessage]) {
    return KEYCLOAK_ERROR_MESSAGES[cleanMessage];
  }

  if (cleanMessage.includes("invalidPasswordMinLengthMessage")) {
    const match = cleanMessage.match(/\d+/);
    return match
      ? `Password must be at least ${match[0]} characters.`
      : "Password is too short.";
  }

  return cleanMessage
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export async function getKeycloakError(response, fallback) {
  const text = await response.text();

  if (!text) {
    return fallback;
  }

  try {
    const data = JSON.parse(text);
    return formatKeycloakError(data.errorMessage || data.error, fallback);
  } catch {
    return formatKeycloakError(text, fallback);
  }
}

export function readAttributeValue(attributes, key) {
  const value = attributes?.[key];
  if (Array.isArray(value)) return value[0];
  return value;
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

export async function getUserRealmRoles(userId) {
  const response = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
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
