import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

type KeycloakClient = {
  id: string;
  clientId: string;
  name?: string;
};

type KeycloakClientRole = {
  id?: string;
  name?: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
};

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const clientsRes = await keycloakAdminFetch("/clients");
    if (!clientsRes.ok) {
      const error = await getKeycloakError(clientsRes, "Failed to fetch clients");
      return NextResponse.json({ error }, { status: clientsRes.status });
    }
    const clients = (await clientsRes.json()) as KeycloakClient[];
    const result: Array<KeycloakClient & { roles: Array<KeycloakClientRole & { clientId: string; clientUuid: string }> }> = [];

    for (const client of clients) {
      const rolesRes = await keycloakAdminFetch(`/clients/${encodeURIComponent(client.id)}/roles`);
      if (!rolesRes.ok) continue;
      const roles = (await rolesRes.json()) as KeycloakClientRole[];
      result.push({
        id: client.id,
        clientId: client.clientId,
        name: client.name,
        roles: roles.map((role) => ({ ...role, clientId: client.clientId, clientUuid: client.id })),
      });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch client roles" },
      { status: 500 },
    );
  }
}
