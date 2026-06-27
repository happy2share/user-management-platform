import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

async function readUsers() {
  const usersRes = await keycloakAdminFetch("/users?max=1000");

  if (!usersRes.ok) {
    throw new Error(await getKeycloakError(usersRes, "Failed to fetch users"));
  }

  return usersRes.json();
}

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const users = await readUsers();
    const sessions: any[] = [];

    for (const user of users) {
      const sessionRes = await keycloakAdminFetch(
        `/users/${encodeURIComponent(user.id)}/sessions`,
      );

      if (!sessionRes.ok) {
        throw new Error(
          await getKeycloakError(sessionRes, "Failed to fetch user sessions"),
        );
      }

      const userSessions = await sessionRes.json();
      userSessions.forEach((s: any) => {
        sessions.push({
          ...s,
          username: user.username,
          email: user.email,
          userId: user.id,
        });
      });
    }

    return NextResponse.json(sessions);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch sessions" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const users = await readUsers();
    const failures: string[] = [];

    for (const user of users) {
      const response = await keycloakAdminFetch(
        `/users/${encodeURIComponent(user.id)}/logout`,
        { method: "POST" },
      );

      if (!response.ok) {
        const error = await getKeycloakError(response, "Failed to revoke session");
        failures.push(`${user.username || user.id}: ${error}`);
      }
    }

    if (failures.length > 0) {
      return NextResponse.json(
        { error: `Failed to revoke sessions for: ${failures.join(", ")}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ message: "All Keycloak user sessions revoked" });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to revoke sessions" },
      { status: 500 },
    );
  }
}
