import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch, keycloakAdminFetchAll } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

type KeycloakUser = {
  id: string;
  username?: string;
  email?: string;
};

type KeycloakClient = {
  id: string;
};

type KeycloakSession = {
  id?: string;
  userId?: string;
  username?: string;
  ipAddress?: string;
  start?: number;
  lastAccess?: number;
  clients?: Record<string, string>;
};

async function readClients() {
  const clientsRes = await keycloakAdminFetch("/clients");

  if (!clientsRes.ok) {
    const error = await getKeycloakError(clientsRes, "Failed to fetch clients");
    throw new Error(error);
  }

  return clientsRes.json();
}

async function readClientSessions(clientId: string) {
  const sessionsRes = await keycloakAdminFetch(
    `/clients/${encodeURIComponent(clientId)}/user-sessions`,
  );

  if (!sessionsRes.ok) {
    const error = await getKeycloakError(sessionsRes, "Failed to fetch user sessions");
    throw new Error(error);
  }

  return sessionsRes.json();
}

async function readUsers() {
  return keycloakAdminFetchAll("/users") as Promise<KeycloakUser[]>;
}

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const clients = (await readClients()) as KeycloakClient[];
    const sessionsById = new Map<string, KeycloakSession>();

    const sessionsByClient = await Promise.all(
      clients.map((client) => readClientSessions(client.id)),
    );

    sessionsByClient.flat().forEach((session: KeycloakSession) => {
      const key = session.id || `${session.userId || ""}:${session.start || ""}:${session.ipAddress || ""}`;
      const existing = sessionsById.get(key);
      sessionsById.set(key, {
        ...existing,
        ...session,
        clients: {
          ...existing?.clients,
          ...session.clients,
        },
      });
    });

    return NextResponse.json([...sessionsById.values()]);
  } catch (err: unknown) {
    const error = await getKeycloakError(err, "Failed to fetch sessions");
    return NextResponse.json({ error }, { status: 500 });
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
  } catch (err: unknown) {
    const error = await getKeycloakError(err, "Failed to revoke sessions");
    return NextResponse.json({ error }, { status: 500 });
  }
}
