import { keycloakAdminFetch } from "./keycloak";
import { getKeycloakError } from "./keycloak-error";

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
