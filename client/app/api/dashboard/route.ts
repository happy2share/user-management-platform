import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch, keycloakAdminFetchAll } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

type ClientSessionStat = {
  active?: string | number;
};

async function jsonOrThrow(path: string) {
  const res = await keycloakAdminFetch(path);
  if (!res.ok) throw new Error(await getKeycloakError(res, `Failed to fetch ${path}`));
  return res.json();
}

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const [realm, users, roles, groups, clients, clientSessionStats] = await Promise.all([
      jsonOrThrow(""),
      keycloakAdminFetchAll("/users"),
      jsonOrThrow("/roles"),
      jsonOrThrow("/groups"),
      jsonOrThrow("/clients"),
      jsonOrThrow("/client-session-stats"),
    ]);

    const enabledUsers = users.filter((u: { enabled?: boolean }) => u.enabled !== false).length;
    const disabledUsers = users.filter((u: { enabled?: boolean }) => u.enabled === false).length;
    const activeSessions = clientSessionStats.reduce(
      (total: number, stat: ClientSessionStat) => total + Number(stat.active || 0),
      0,
    );

    return NextResponse.json({
      realm: realm.realm,
      enabled: realm.enabled,
      displayName: realm.displayName,
      totalUsers: users.length,
      enabledUsers,
      disabledUsers,
      rolesCount: roles.length,
      groupsCount: groups.length,
      clientsCount: clients.length,
      activeSessions,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load dashboard" }, { status: 500 });
  }
}
