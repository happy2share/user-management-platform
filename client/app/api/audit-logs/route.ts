import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "@/app/lib/api-auth";
import { keycloakAdminFetch } from "@/app/lib/keycloak";
import { KEYCLOAK_ADMIN_CLIENT_ID } from "@/app/lib/constants";

type UserEvent = {
  id?: string;
  time: number;
  type?: string;
  realmId?: string;
  clientId?: string;
  userId?: string;
  ipAddress?: string;
  error?: string;
  details?: Record<string, string>;
};

type AdminEvent = {
  id?: string;
  time: number;
  realmId?: string;
  authDetails?: {
    userId?: string;
    clientId?: string;
    ipAddress?: string;
  };
  operationType?: string;
  resourceType?: string;
  resourcePath?: string;
  error?: string;
};

function targetUserId(resourcePath?: string) {
  return resourcePath?.match(/(?:^|\/)users\/([^/]+)/)?.[1];
}

async function usernameMap(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      const response = await keycloakAdminFetch(`/users/${encodeURIComponent(id)}`);
      if (!response.ok) return [id, id] as const;
      const user = (await response.json()) as { username?: string };
      return [id, user.username || id] as const;
    }),
  );
  return new Map(entries);
}

export async function GET(request: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  const requestedMax = Number(new URL(request.url).searchParams.get("max") || 100);
  const max = Number.isInteger(requestedMax)
    ? Math.min(Math.max(requestedMax, 1), 500)
    : 100;

  try {
    const [userResponse, adminResponse] = await Promise.all([
      keycloakAdminFetch(`/events?max=${max}`),
      keycloakAdminFetch(`/admin-events?max=${max}`),
    ]);

    if (userResponse.status === 403 || adminResponse.status === 403) {
      return NextResponse.json(
        {
          error:
            "Keycloak denied audit event access. Assign the realm-management view-events role to the admin service account and enable events in the realm.",
        },
        { status: 403 },
      );
    }

    if (!userResponse.ok || !adminResponse.ok) {
      const failed = !userResponse.ok ? userResponse : adminResponse;
      throw new Error((await failed.text()) || "Keycloak audit request failed");
    }

    const userEvents = (await userResponse.json()) as UserEvent[];
    const adminEvents = (await adminResponse.json()) as AdminEvent[];
    const names = await usernameMap([
      ...userEvents.map((event) => event.userId || ""),
      ...adminEvents.map((event) => event.authDetails?.userId || ""),
      ...adminEvents.map((event) => targetUserId(event.resourcePath) || ""),
    ]);
    const nameOf = (id?: string) => (id ? names.get(id) || id : "-");

    const logs = [
      ...userEvents
        .filter(
          (event) =>
            !(
              event.type === "CLIENT_LOGIN" &&
              event.clientId === KEYCLOAK_ADMIN_CLIENT_ID &&
              event.details?.grant_type === "client_credentials"
            ),
        )
        .map((event, index) => ({
          id: `user-${event.id || `${event.time}-${event.type}-${event.userId || ""}-${index}`}`,
          time: event.time,
          category: "Authentication",
          action: event.type || "UNKNOWN",
          status: event.error ? "Failed" : "Success",
          actor: event.details?.username || nameOf(event.userId),
          account: event.details?.username || nameOf(event.userId),
          client: event.clientId || event.details?.client_id || "-",
          resource: event.realmId || "-",
          ipAddress: event.ipAddress || "-",
          error: event.error || "",
        })),
      ...adminEvents.map((event, index) => {
        const accountId = targetUserId(event.resourcePath);
        return {
          id: `admin-${event.id || `${event.time}-${event.operationType}-${event.resourcePath || ""}-${index}`}`,
          time: event.time,
          category: "Administration",
          action: event.resourcePath?.includes("reset-password")
            ? "RESET USER PASSWORD"
            : event.resourcePath?.includes("credentials")
              ? "UPDATE USER CREDENTIALS"
              : [event.operationType, event.resourceType].filter(Boolean).join(" "),
          status: event.error ? "Failed" : "Success",
          actor: nameOf(event.authDetails?.userId),
          account: nameOf(accountId),
          client: event.authDetails?.clientId || "-",
          resource: event.resourcePath || event.realmId || "-",
          ipAddress: event.authDetails?.ipAddress || "-",
          error: event.error || "",
        };
      }),
    ]
      .sort((a, b) => b.time - a.time)
      .slice(0, max);

    return NextResponse.json(logs);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch audit logs",
      },
      { status: 502 },
    );
  }
}
