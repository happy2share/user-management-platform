import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "@/app/lib/api-auth";
import { keycloakAdminFetch } from "@/app/lib/keycloak";
import { KEYCLOAK_ADMIN_CLIENT_ID } from "@/app/lib/constants";
import { getUserRealmRoles } from "@/app/lib/keycloak-users";
import { highestStaffRole } from "@/app/lib/staff-portals";
import { readLocalLogs } from "@/app/lib/file-logger.mjs";

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

type LocalEvent = {
  timestamp?: string;
  level?: string;
  message?: string;
  meta?: {
    actor?: unknown;
    account?: unknown;
    username?: unknown;
    endpoint?: unknown;
    component?: unknown;
    method?: unknown;
    operation?: unknown;
    ipAddress?: unknown;
    error?: unknown;
    userInfo?: {
      userId?: unknown;
      name?: unknown;
      email?: unknown;
    };
  };
};

function targetUserId(resourcePath?: string) {
  return resourcePath?.match(/(?:^|\/)users\/([^/]+)/)?.[1];
}

function eventMessage({
  action,
  actor,
  account,
  resource,
  status,
}: {
  action: string;
  actor: string;
  account: string;
  resource: string;
  status: string;
}) {
  const target = account && account !== "-" ? ` for account ${account}` : "";
  const place = resource && resource !== "-" ? ` on ${resource}` : "";
  return `${actor} ${status.toLowerCase()} ${action}${target}${place}`;
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

function mainRole(roles: string[]) {
  if (roles.includes("realm-admin")) return "admin";
  return highestStaffRole(roles) || (roles.includes("app-user") ? "user" : roles[0]) || "-";
}

async function roleMap(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const roles = (await getUserRealmRoles(id)) as Array<{ name: string }>;
        return [id, mainRole(roles.map((role) => role.name))] as const;
      } catch {
        return [id, "-"] as const;
      }
    }),
  );
  return new Map(entries);
}

function localAuditLogs(entries: LocalEvent[]) {
  return entries.map((entry, index) => {
    const meta = entry.meta || {};
    const user = meta.userInfo || {};
    const level = String(entry.level || "info").toUpperCase();
    const actor = String(meta.actor || user.name || user.email || user.userId || meta.username || "system");
    const account = String(meta.account || meta.username || user.email || user.name || user.userId || "-");
    const endpoint = String(meta.endpoint || meta.component || "local");
    const action = String(meta.operation || [meta.method, meta.endpoint].filter(Boolean).join(" ") || entry.message || "LOG");

    return {
      id: `local-${entry.timestamp || "unknown"}-${index}`,
      time: Date.parse(entry.timestamp || "") || Date.now(),
      category: "Application",
      action,
      status: level === "ERROR" ? "Failed" : level === "WARN" ? "Warning" : "Success",
      level,
      message: entry.message || action,
      actor,
      account,
      client: "application",
      resource: endpoint,
      ipAddress: String(meta.ipAddress || "-"),
      error: level === "ERROR" && typeof meta.error === "string" ? meta.error : "",
    };
  });
}

function auditWarning(message: string) {
  return {
    id: `audit-warning-${Date.now()}`,
    time: Date.now(),
    category: "System",
    action: "AUDIT SOURCE UNAVAILABLE",
    status: "Warning",
    level: "WARN",
    message,
    actor: "system",
    account: "-",
    client: "application",
    resource: "Keycloak audit events",
    ipAddress: "-",
    error: "",
  };
}

export async function GET(request: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  const requestedMax = Number(new URL(request.url).searchParams.get("max") || 100);
  const max = Number.isInteger(requestedMax)
    ? Math.min(Math.max(requestedMax, 1), 500)
    : 100;
  const localLogs = localAuditLogs((await readLocalLogs(max)) as LocalEvent[]);

  try {
    const [userResponse, adminResponse] = await Promise.all([
      keycloakAdminFetch(`/events?max=${max}`),
      keycloakAdminFetch(`/admin-events?max=${max}`),
    ]);

    if (userResponse.status === 403 || adminResponse.status === 403) {
      if (localLogs.length) {
        return NextResponse.json([
          auditWarning("Keycloak denied audit-event access; showing local logs only."),
          ...localLogs,
        ].slice(0, max));
      }
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
    const roles = await roleMap([
      ...userEvents.map((event) => event.userId || ""),
      ...adminEvents.map((event) => event.authDetails?.userId || ""),
    ]);
    const nameOf = (id?: string) => (id ? names.get(id) || id : "-");
    const roleOf = (id?: string) => (id ? roles.get(id) || "-" : "-");

    const logs = [
      ...localLogs,
      ...userEvents
        .filter(
          (event) =>
            !(
              event.type === "CLIENT_LOGIN" &&
              event.clientId === KEYCLOAK_ADMIN_CLIENT_ID &&
              event.details?.grant_type === "client_credentials"
            ),
        )
        .map((event, index) => {
          const action = event.type || "UNKNOWN";
          const status = event.error ? "Failed" : "Success";
          const actor = roleOf(event.userId);
          const account = event.details?.username || nameOf(event.userId);
          const resource = event.realmId || "-";
          return {
            id: `user-${event.id || `${event.time}-${event.type}-${event.userId || ""}-${index}`}`,
            time: event.time,
            category: "Authentication",
            action,
            status,
            level: event.error ? "ERROR" : "INFO",
            message: eventMessage({ action, actor, account, resource, status }),
            actor,
            account,
            client: event.clientId || event.details?.client_id || "-",
            resource,
            ipAddress: event.ipAddress || "-",
            error: event.error || "",
          };
        }),
      ...adminEvents.map((event, index) => {
        const accountId = targetUserId(event.resourcePath);
        const action = event.resourcePath?.includes("reset-password")
          ? "RESET USER PASSWORD"
          : event.resourcePath?.includes("credentials")
            ? "UPDATE USER CREDENTIALS"
            : [event.operationType, event.resourceType].filter(Boolean).join(" ");
        const status = event.error ? "Failed" : "Success";
        const actor = roleOf(event.authDetails?.userId);
        const account = nameOf(accountId);
        const resource = event.resourcePath || event.realmId || "-";
        return {
          id: `admin-${event.id || `${event.time}-${event.operationType}-${event.resourcePath || ""}-${index}`}`,
          time: event.time,
          category: "Administration",
          action,
          status,
          level: event.error ? "ERROR" : "INFO",
          message: eventMessage({ action, actor, account, resource, status }),
          actor,
          account,
          client: event.authDetails?.clientId || "-",
          resource,
          ipAddress: event.authDetails?.ipAddress || "-",
          error: event.error || "",
        };
      }),
    ]
      .sort((a, b) => b.time - a.time)
      .slice(0, max);

    return NextResponse.json(logs);
  } catch (error: unknown) {
    if (localLogs.length) {
      return NextResponse.json([
        auditWarning("Keycloak audit events are unavailable; showing local logs only."),
        ...localLogs,
      ].slice(0, max));
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch audit logs",
      },
      { status: 502 },
    );
  }
}
