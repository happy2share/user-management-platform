import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../../../lib/api-auth";
import { cleanDisplayText as cleanDescription } from "../../../../../lib/display-text";
import { keycloakAdminFetch } from "../../../../../lib/keycloak";
import { getKeycloakError } from "../../../../../lib/keycloak-users";

type RouteContext = { params: Promise<{ name: string }> };
type ClientInfo = { id: string; clientId: string; name?: string };
type RoleRep = {
  id?: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
  clientId?: string;
  clientUuid?: string;
  rawDescription?: string;
};

function roleKey(role: RoleRep) {
  if (!role.clientRole) return `realm:${role.name}`;
  return `client:${role.containerId || role.clientUuid || role.clientId}:${role.name}`;
}

function normalizeRealmRole(role: RoleRep, assignedKeys: Set<string>) {
  const normalized = {
    ...role,
    clientRole: false,
    clientId: undefined,
    clientUuid: undefined,
    source: "realm",
    containerId: role.containerId,
    inherited: false,
    rawDescription: role.description || "",
    description: cleanDescription(role.description),
  };

  return {
    ...normalized,
    inherited: assignedKeys.has(roleKey(normalized)),
  };
}

function normalizeClientRole(role: RoleRep, client: ClientInfo, assignedKeys: Set<string>) {
  const normalized = {
    ...role,
    clientRole: true,
    containerId: client.id,
    clientUuid: client.id,
    clientId: client.clientId,
    source: client.clientId,
    inherited: false,
    rawDescription: role.description || "",
    description: cleanDescription(role.description),
  };

  return {
    ...normalized,
    inherited: assignedKeys.has(roleKey(normalized)),
  };
}

export async function GET(_req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const encodedRoleName = encodeURIComponent(name);

    const assignedRes = await keycloakAdminFetch(`/roles/${encodedRoleName}/composites`);
    if (!assignedRes.ok) {
      const error = await getKeycloakError(assignedRes, "Failed to fetch assigned composite roles");
      return NextResponse.json({ error }, { status: assignedRes.status });
    }

    const assignedRoles = (await assignedRes.json()) as RoleRep[];
    const assignedKeys = new Set(assignedRoles.map(roleKey));

    const allRealmRolesRes = await keycloakAdminFetch("/roles?max=1000");
    if (!allRealmRolesRes.ok) {
      const error = await getKeycloakError(allRealmRolesRes, "Failed to fetch realm roles");
      return NextResponse.json({ error }, { status: allRealmRolesRes.status });
    }

    const availableRealmRoles = ((await allRealmRolesRes.json()) as RoleRep[])
      .filter((role) => role.name !== name)
      .map((role) => normalizeRealmRole(role, assignedKeys))
      .filter((role) => !role.composite || role.name !== name);

    const clientsRes = await keycloakAdminFetch("/clients?max=1000");
    if (!clientsRes.ok) {
      const error = await getKeycloakError(clientsRes, "Failed to fetch clients");
      return NextResponse.json({ error }, { status: clientsRes.status });
    }

    const clients = (await clientsRes.json()) as ClientInfo[];
    const availableClientRoles: ReturnType<typeof normalizeClientRole>[] = [];

    for (const client of clients) {
      const allClientRolesRes = await keycloakAdminFetch(
        `/clients/${encodeURIComponent(client.id)}/roles?max=1000`,
      );

      if (!allClientRolesRes.ok) continue;

      const roles = (await allClientRolesRes.json()) as RoleRep[];
      availableClientRoles.push(...roles.map((role) => normalizeClientRole(role, client, assignedKeys)));
    }

    return NextResponse.json([
      ...availableRealmRoles,
      ...availableClientRoles,
    ]);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch available roles" },
      { status: 500 },
    );
  }
}
