import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../../lib/api-auth";
import { cleanDisplayText as cleanDescription } from "../../../../lib/display-text";
import { keycloakAdminFetch } from "../../../../lib/keycloak";
import { getKeycloakError } from "../../../../lib/keycloak-users";

type RouteContext = { params: Promise<{ name: string }> };

type ClientInfo = { id: string; clientId: string };

type RoleRep = {
  id?: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
  clientId?: string;
  clientUuid?: string;
  source?: string;
  rawDescription?: string;
  inherited?: boolean;
  composites?: {
    realm?: string[];
    client?: Record<string, string[]>;
  };
};

async function getClientMaps() {
  const res = await keycloakAdminFetch("/clients?max=1000");
  if (!res.ok) return { clients: [] as ClientInfo[], byUuid: new Map<string, ClientInfo>(), byClientId: new Map<string, ClientInfo>() };
  const clients = (await res.json()) as ClientInfo[];
  return {
    clients,
    byUuid: new Map(clients.map((client) => [client.id, client])),
    byClientId: new Map(clients.map((client) => [client.clientId, client])),
  };
}

function roleKey(role: RoleRep, byUuid?: Map<string, ClientInfo>, byClientId?: Map<string, ClientInfo>) {
  if (!role.clientRole) return `realm:${role.name}`;

  const container = role.containerId || role.clientUuid || "";
  const client = container ? byUuid?.get(container) : undefined;
  const clientId = role.clientId || client?.clientId || container;
  const clientUuid = role.clientUuid || client?.id || byClientId?.get(clientId)?.id || container;

  return `client:${clientUuid || clientId}:${role.name}`;
}

async function getDirectCompositeKeys(roleName: string, clients: ClientInfo[], role?: RoleRep) {
  const keys = new Set<string>();

  for (const realmRoleName of role?.composites?.realm ?? []) {
    keys.add(`realm:${realmRoleName}`);
  }

  for (const [clientId, roleNames] of Object.entries(role?.composites?.client ?? {})) {
    const client = clients.find((item) => item.clientId === clientId || item.id === clientId);
    for (const roleNameItem of roleNames) {
      keys.add(`client:${client?.id || clientId}:${roleNameItem}`);
    }
  }

  const realmRes = await keycloakAdminFetch(`/roles/${encodeURIComponent(roleName)}/composites/realm`);
  if (realmRes.ok) {
    const realmRoles = (await realmRes.json()) as RoleRep[];
    for (const item of realmRoles) keys.add(`realm:${item.name}`);
  }

  for (const client of clients) {
    const clientRes = await keycloakAdminFetch(
      `/roles/${encodeURIComponent(roleName)}/composites/clients/${encodeURIComponent(client.id)}`,
    );
    if (!clientRes.ok) continue;
    const clientRoles = (await clientRes.json()) as RoleRep[];
    for (const item of clientRoles) {
      keys.add(`client:${client.id}:${item.name}`);
    }
  }

  return keys;
}

function toKeycloakRole(role: RoleRep) {
  const representation: RoleRep = {
    id: role.id,
    name: role.name,
    composite: Boolean(role.composite),
    clientRole: Boolean(role.clientRole),
  };

  if (role.rawDescription ?? role.description) {
    representation.description = role.rawDescription ?? role.description;
  }

  if (role.clientRole) {
    representation.containerId = role.containerId || role.clientUuid;
  }

  return representation;
}

function enrichRole(
  role: RoleRep,
  byUuid: Map<string, ClientInfo>,
  byClientId: Map<string, ClientInfo>,
  directKeys: Set<string>,
) {
  const client = role.clientRole && role.containerId ? byUuid.get(role.containerId) : undefined;
  const source = role.clientRole ? client?.clientId || role.clientId || role.containerId : "realm";
  return {
    ...role,
    source,
    clientId: role.clientRole ? source : undefined,
    clientUuid: role.clientRole ? client?.id || role.containerId : undefined,
    inherited: directKeys.size > 0 ? !directKeys.has(roleKey(role, byUuid, byClientId)) : false,
    rawDescription: role.description || "",
    description: cleanDescription(role.description),
  };
}

export async function GET(req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const { searchParams } = new URL(req.url);
    const includeInherited = searchParams.get("inherited") !== "false";

    const [roleRes, compositesRes, maps] = await Promise.all([
      keycloakAdminFetch(`/roles/${encodeURIComponent(name)}`),
      keycloakAdminFetch(`/roles/${encodeURIComponent(name)}/composites`),
      getClientMaps(),
    ]);

    if (!roleRes.ok) {
      const error = await getKeycloakError(roleRes, "Failed to fetch role");
      return NextResponse.json({ error }, { status: roleRes.status });

    }

    if (!compositesRes.ok) {
      const error = await getKeycloakError(compositesRes, "Failed to fetch associated roles");
      return NextResponse.json({ error }, { status: compositesRes.status });

    }

    const role = (await roleRes.json()) as RoleRep;
    const composites = (await compositesRes.json()) as RoleRep[];
    const directKeys = await getDirectCompositeKeys(name, maps.clients, role);
    const enriched = composites.map((item) => enrichRole(item, maps.byUuid, maps.byClientId, directKeys));

    return NextResponse.json(includeInherited ? enriched : enriched.filter((item) => !item.inherited));
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch associated roles" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const body = await req.json();
    const roles = Array.isArray(body.roles) ? body.roles : [];
    if (!roles.length) return NextResponse.json({ error: "Select at least one role" }, { status: 400 });
    const res = await keycloakAdminFetch(`/roles/${encodeURIComponent(name)}/composites`, {
      method: "POST",
      body: JSON.stringify(roles.map(toKeycloakRole)),
    });
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to assign roles");
      return NextResponse.json({ error }, { status: res.status });
    }
    return NextResponse.json({ message: "Roles assigned successfully" });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to assign roles" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const body = await req.json();
    const roles = Array.isArray(body.roles) ? body.roles : [];
    if (!roles.length) return NextResponse.json({ error: "Select at least one role" }, { status: 400 });
    const res = await keycloakAdminFetch(`/roles/${encodeURIComponent(name)}/composites`, {
      method: "DELETE",
      body: JSON.stringify(roles.map(toKeycloakRole)),
    });
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to unassign roles");
      return NextResponse.json({ error }, { status: res.status });
    }
    return NextResponse.json({ message: "Roles unassigned successfully" });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unassign roles" },
      { status: 500 },
    );
  }
}
