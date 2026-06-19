import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";

async function readUsers() {
  const usersRes = await keycloakAdminFetch("/users?max=1000");

  if (!usersRes.ok) {
    throw new Error(await usersRes.text());
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

      if (sessionRes.ok) {
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
        failures.push(user.username || user.id);
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
