import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

type ClientSessionStat = {
  active?: number | string;
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
      jsonOrThrow("/users?max=200"),
      jsonOrThrow("/roles"),
      jsonOrThrow("/groups"),
      jsonOrThrow("/clients"),
      jsonOrThrow("/client-session-stats"),
    ]);

    const enabledUsers = users.filter((u: { enabled?: boolean }) => u.enabled).length;
    const disabledUsers = users.length - enabledUsers;
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
    const message = await getKeycloakError(error, "Failed to load dashboard");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
