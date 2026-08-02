import net from "node:net";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { ApiNextResponse as NextResponse } from "./api-response";
import { logError } from "./file-logger.mjs";

type RateLimitOptions = {
  endpoint: string;
  method: string;
  attempts: number;
  timeRangeSeconds: number;
};

type RedisCommandResult = string | number | null | RedisCommandResult[];

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const FAIL_CLOSED = process.env.REDIS_RATE_LIMIT_FAIL_CLOSED === "true";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const KEY_PREFIX = process.env.REDIS_RATE_LIMIT_PREFIX || "iam:rate";

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function parseRedisUrl() {
  const url = new URL(REDIS_URL);
  return {
    host: url.hostname || "127.0.0.1",
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : "",
  };
}

function encodeRedisCommand(parts: Array<string | number>) {
  return `*${parts.length}\r\n${parts
    .map((part) => {
      const value = String(part);
      return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
    })
    .join("")}`;
}

function parseRedisResponses(buffer: Buffer): RedisCommandResult[] {
  let offset = 0;

  function readLine() {
    const end = buffer.indexOf("\r\n", offset);
    if (end < 0) throw new Error("Invalid Redis response");
    const line = buffer.toString("utf8", offset, end);
    offset = end + 2;
    return line;
  }

  function readValue(): RedisCommandResult {
    const prefix = buffer.toString("utf8", offset, offset + 1);
    offset += 1;

    if (prefix === "+") return readLine();
    if (prefix === ":") return Number(readLine());
    if (prefix === "-") throw new Error(readLine());
    if (prefix === "$") {
      const length = Number(readLine());
      if (length === -1) return null;
      const value = buffer.toString("utf8", offset, offset + length);
      offset += length + 2;
      return value;
    }
    if (prefix === "*") {
      const length = Number(readLine());
      const values: RedisCommandResult[] = [];
      for (let index = 0; index < length; index += 1) values.push(readValue());
      return values;
    }

    throw new Error("Unsupported Redis response");
  }

  const values: RedisCommandResult[] = [];
  while (offset < buffer.length) values.push(readValue());
  return values;
}

function sendRedisCommand(
  parts: Array<string | number>,
): Promise<RedisCommandResult> {
  const { host, port, password } = parseRedisUrl();
  const commands = password
    ? encodeRedisCommand(["AUTH", password]) + encodeRedisCommand(parts)
    : encodeRedisCommand(parts);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      socket.destroy();
      reject(new Error("Redis rate limiter timed out"));
    }, 1000);

    function settle(result: RedisCommandResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.end();
      resolve(result);
    }

    socket.on("connect", () => socket.write(commands));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      try {
        const results = parseRedisResponses(Buffer.concat(chunks));
        const expectedResponses = password ? 2 : 1;
        if (results.length < expectedResponses) return;
        settle(results.at(-1) ?? null);
      } catch {
        // Wait for the rest of the Redis response.
      }
    });
    socket.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function clientIp(req: Request) {
  if (!TRUST_PROXY) return "unknown";

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export function normalizeRateLimitEndpoint(endpoint: string) {
  return endpoint
    .replace(/^\/api\/(users|clients|groups|sessions)\/[^/]+/, "/api/$1/:id")
    .replace(/^\/api\/roles\/[^/]+/, "/api/roles/:name");
}

function sanitizeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9:._-]/g, "_").slice(0, 160);
}

function memoryRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const current = memoryStore.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000;
    memoryStore.set(key, { count: 1, resetAt });
    return { count: 1, resetSeconds: windowSeconds };
  }

  current.count += 1;
  return {
    count: current.count,
    resetSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

function rateLimitResponse(limit: number, resetSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(resetSeconds),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetSeconds),
      },
    },
  );
}

export async function rateLimit(
  req: NextRequest,
  { endpoint, method, attempts, timeRangeSeconds }: RateLimitOptions,
) {
  if (process.env.RATE_LIMIT_DISABLED === "true") return null;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const userId = String(token?.userId || token?.sub || "");
  const ip = clientIp(req);
  if (!userId && ip === "unknown") return null;
  const actor = userId ? `user:${userId}` : `ip:${ip}`;
  const normalizedEndpoint = normalizeRateLimitEndpoint(endpoint);
  const key = [KEY_PREFIX, method.toUpperCase(), normalizedEndpoint, actor]
    .map(sanitizeKeyPart)
    .join(":");

  try {
    const result = await sendRedisCommand([
      "EVAL",
      "local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return {count,redis.call('TTL',KEYS[1])}",
      1,
      key,
      timeRangeSeconds,
    ]);
    const [count, ttl] = Array.isArray(result) ? result : [0, timeRangeSeconds];

    if (Number(count) > attempts) {
      return rateLimitResponse(attempts, Math.max(1, Number(ttl)));
    }
    return null;
  } catch (error) {
    void logError("Redis rate limiter unavailable", {
      operation: "rateLimit",
      endpoint,
      method,
      actor,
      attempts,
      timeRangeSeconds,
      error,
    });

    if (
      FAIL_CLOSED ||
      (process.env.NODE_ENV === "production" &&
        (endpoint.startsWith("/api/auth/") || endpoint.startsWith("/api/public/")))
    ) {
      return NextResponse.json(
        { error: "Rate limiter is unavailable. Please try again later." },
        { status: 503 },
      );
    }

    const result = memoryRateLimit(key, attempts, timeRangeSeconds);
    if (result.count > attempts) {
      return rateLimitResponse(attempts, result.resetSeconds);
    }

    return null;
  }
}

export async function rateLimitIdentifier(
  scope: string,
  identifier: string,
  attempts: number,
  timeRangeSeconds: number,
) {
  const key = [KEY_PREFIX, scope, sanitizeKeyPart(identifier)].join(":");
  try {
    const result = await sendRedisCommand([
      "EVAL",
      "local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return count",
      1,
      key,
      timeRangeSeconds,
    ]);
    return Number(result) > attempts;
  } catch (error) {
    void logError("Redis identifier limiter unavailable", {
      operation: "rateLimitIdentifier",
      scope,
      identifier,
      attempts,
      timeRangeSeconds,
      error,
    });
    return memoryRateLimit(key, attempts, timeRangeSeconds).count > attempts;
  }
}

export async function clearRateLimitIdentifier(
  scope: string,
  identifier: string,
) {
  const key = [KEY_PREFIX, scope, sanitizeKeyPart(identifier)].join(":");
  memoryStore.delete(key);
  try {
    await sendRedisCommand(["DEL", key]);
  } catch (error) {
    void logError("Failed to clear Redis identifier limiter", {
      operation: "clearRateLimitIdentifier",
      scope,
      identifier,
      error,
    });
  }
}

export const rateLimits = {
  default: { attempts: 100, timeRangeSeconds: 60 },
  auth: { attempts: 20, timeRangeSeconds: 60 },
  register: { attempts: 5, timeRangeSeconds: 300 },
  passwordCheck: { attempts: 20, timeRangeSeconds: 60 },
  emailSend: { attempts: 3, timeRangeSeconds: 300 },
  emailVerify: { attempts: 10, timeRangeSeconds: 300 },
  mfaSetup: { attempts: 5, timeRangeSeconds: 300 },
  mfaVerify: { attempts: 10, timeRangeSeconds: 300 },
  loginLookup: { attempts: 20, timeRangeSeconds: 60 },
};

export function rateLimitFor(endpoint: string) {
  if (endpoint.startsWith("/api/auth/")) return rateLimits.auth;
  if (endpoint === "/api/public/register") return rateLimits.register;
  if (endpoint === "/api/public/password-check")
    return rateLimits.passwordCheck;
  if (
    endpoint.endsWith("/email-verification/send") ||
    endpoint.endsWith("/resend-setup-email")
  )
    return rateLimits.emailSend;
  if (endpoint.endsWith("/email-verification/verify"))
    return rateLimits.emailVerify;
  if (endpoint.endsWith("/mfa/setup")) return rateLimits.mfaSetup;
  if (endpoint.endsWith("/mfa/verify")) return rateLimits.mfaVerify;
  if (endpoint.endsWith("/login-hint") || endpoint.endsWith("/login-status"))
    return rateLimits.loginLookup;
  if (endpoint === "/api/public/forgot-password") return rateLimits.emailSend;
  if (endpoint === "/api/public/reset-password") return rateLimits.emailVerify;
  return {
    attempts: Number(
      process.env.API_RATE_LIMIT_ATTEMPTS || rateLimits.default.attempts,
    ),
    timeRangeSeconds: Number(
      process.env.API_RATE_LIMIT_WINDOW_SECONDS ||
        rateLimits.default.timeRangeSeconds,
    ),
  };
}
