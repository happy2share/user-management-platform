import { getServerSession } from "next-auth";
import { authorizedSessionFor } from "./api-auth";
import { authOptions } from "./auth";
import { logDebug, logError, logInfo, logWarn } from "./file-logger.mjs";

type SessionInfo = {
  userId?: string;
  roles?: string[];
  user?: {
    name?: string | null;
    email?: string | null;
  };
};

type RouteParams = Record<string, unknown>;
type LogLevel = "debug" | "info" | "warn" | "error";

const logWriters = {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
};

export function logEntry(
  level: LogLevel,
  message: string,
  meta: Record<string, unknown> = {},
) {
  return logWriters[level](message, meta).catch(() => {});
}

function getIpAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function readBody(request: Request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return undefined;
  if (!request.headers.get("content-type")?.includes("application/json")) return undefined;
  return request.clone().json().catch(() => "[unreadable body]");
}

export async function commonEntryLog(
  request: Request,
  params: RouteParams = {},
) {
  const url = new URL(request.url);
  const session = (authorizedSessionFor(request) ??
    (await getServerSession(authOptions).catch(() => null))) as SessionInfo | null;

  await logEntry("info", `${request.method} ${url.pathname} requested from admin UI`, {
    userInfo: {
      userId: session?.userId,
      name: session?.user?.name,
      email: session?.user?.email,
      roles: session?.roles ?? [],
    },
    method: request.method,
    endpoint: url.pathname,
    reqBody: await readBody(request),
    queryParams: Object.fromEntries(url.searchParams),
    params,
    ipAddress: getIpAddress(request),
    timeUTC: new Date().toISOString(),
    component: "admin UI",
  }).catch(() => {});
}
