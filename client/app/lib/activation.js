import crypto from "node:crypto";
import { keycloakAdminFetch } from "./keycloak";
import { getKeycloakError } from "./keycloak-error";

export async function invalidateUserSessions(userId) {
  const userResponse = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`);
  if (!userResponse.ok) {
    throw new Error(await getKeycloakError(userResponse, "Failed to load user"));
  }

  const user = await userResponse.json();
  const updateResponse = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({
      ...user,
      attributes: {
        ...(user.attributes || {}),
        sessionVersion: [crypto.randomUUID()],
      },
    }),
  });
  if (!updateResponse.ok) {
    throw new Error(await getKeycloakError(updateResponse, "Failed to invalidate app sessions"));
  }

  const logoutResponse = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/logout`,
    { method: "POST" },
  );
  if (!logoutResponse.ok) {
    throw new Error(await getKeycloakError(logoutResponse, "Failed to revoke Keycloak sessions"));
  }
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

  await invalidateUserSessions(userId);
}
