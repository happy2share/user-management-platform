import { getServerSession } from "next-auth";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { authOptions } from "../../lib/auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError, getUserRealmRoles } from "../../lib/keycloak-users";

type PortalSession = {
  userId?: string;
  roles?: string[];
};

function cleanDescription(description?: string) {
  if (!description) return "";
  const match = description.match(/^\$\{([^}]+)\}$/);
  if (match?.[1]) {
    return match[1]
      .replace(/^(role|client)_/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return description;
}

type KeycloakRole = {
  id?: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
};

type ClientInfo = {
  id: string;
  clientId: string;
};

function roleKey(role: { name: string; source: string; clientRole: boolean }) {
  return `${role.clientRole ? "client" : "realm"}:${role.source}:${role.name}`;
}

function normalizeRole(
  role: KeycloakRole,
  options: { inherited: boolean; source: string; clientRole: boolean },
) {
  return {
    id: role.id,
    name: role.name,
    inherited: options.inherited,
    composite: role.composite === true,
    clientRole: options.clientRole,
    source: options.source,
    description: cleanDescription(role.description),
  };
}

async function fetchJsonArray(path: string) {
  const response = await keycloakAdminFetch(path);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function getUserVisibleRoles(userId: string) {
  const encodedUserId = encodeURIComponent(userId);
  const directRealmRoles = (await getUserRealmRoles(userId)) as KeycloakRole[];
  const effectiveRealmRoles = (await fetchJsonArray(
    `/users/${encodedUserId}/role-mappings/realm/composite`,
  )) as KeycloakRole[];

  const roles = new Map<string, ReturnType<typeof normalizeRole>>();

  for (const role of directRealmRoles) {
    const normalized = normalizeRole(role, {
      inherited: false,
      source: "realm",
      clientRole: false,
    });
    roles.set(roleKey(normalized), normalized);
  }

  for (const role of effectiveRealmRoles) {
    const normalized = normalizeRole(role, {
      inherited: !roles.has(`realm:realm:${role.name}`),
      source: "realm",
      clientRole: false,
    });
    roles.set(roleKey(normalized), normalized);
  }

  const clients = (await fetchJsonArray("/clients?max=1000")) as ClientInfo[];

  for (const client of clients) {
    const clientRoles = (await fetchJsonArray(
      `/users/${encodedUserId}/role-mappings/clients/${encodeURIComponent(client.id)}/composite`,
    )) as KeycloakRole[];

    for (const role of clientRoles) {
      const normalized = normalizeRole(role, {
        inherited: true,
        source: client.clientId,
        clientRole: true,
      });
      roles.set(roleKey(normalized), normalized);
    }
  }

  return [...roles.values()].sort((a, b) => {
    if (a.clientRole !== b.clientRole) return a.clientRole ? 1 : -1;
    return `${a.source}:${a.name}`.localeCompare(`${b.source}:${b.name}`);
  });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as typeof session & PortalSession | null)?.userId;

    if (!session || !userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const userRes = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`);
    if (!userRes.ok) {
      const error = await getKeycloakError(userRes, "Failed to load user profile");
      return NextResponse.json({ error }, { status: userRes.status });
    }

    const [user, roles] = await Promise.all([
      userRes.json(),
      getUserVisibleRoles(userId).catch(() => []),
    ]);

    return NextResponse.json({
      id: user.id,
      username: user.username,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      enabled: user.enabled !== false,
      roles,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load user profile" },
      { status: 500 },
    );
  }
}
