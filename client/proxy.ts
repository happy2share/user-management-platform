import { trace } from "@opentelemetry/api";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rateLimit, rateLimitFor } from "./app/lib/redis_utility";

export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const span = trace.getActiveSpan();
  span?.setAttribute("app.request.id", requestId);

  const endpoint = request.nextUrl.pathname;
  const limited = await rateLimit(request, {
    endpoint,
    method: request.method,
    ...rateLimitFor(endpoint),
  });

  const response =
    limited ?? NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("x-request-id", requestId);
  const traceId = span?.spanContext().traceId;
  if (traceId) response.headers.set("x-trace-id", traceId);

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
