import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

async function jsonOrThrow(path: string) {
  const res = await keycloakAdminFetch(path);
  if (!res.ok) throw new Error(await getKeycloakError(res, `Failed to fetch ${path}`));
  return res.json();
}

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const [realm, users, roles, groups, clients] = await Promise.all([
      jsonOrThrow(""),
      jsonOrThrow("/users?max=200"),
      jsonOrThrow("/roles"),
      jsonOrThrow("/groups"),
      jsonOrThrow("/clients"),
    ]);

    const enabledUsers = users.filter((u: { enabled?: boolean }) => u.enabled).length;
    const disabledUsers = users.length - enabledUsers;

    const sessionsNested = await Promise.all(
      users.map(async (user: { id: string }) => {
        const res = await keycloakAdminFetch(`/users/${encodeURIComponent(user.id)}/sessions`);
        if (!res.ok) {
          throw new Error(await getKeycloakError(res, "Failed to fetch user sessions"));
        }
        return res.json();
      }),
    );
    const activeSessions = sessionsNested.flat().length;

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
