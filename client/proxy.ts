import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rateLimit, rateLimitFor } from "./app/lib/redis_utility";

export async function proxy(request: NextRequest) {
  const endpoint = request.nextUrl.pathname;
  const limited = await rateLimit(request, {
    endpoint,
    method: request.method,
    ...rateLimitFor(endpoint),
  });

  return limited ?? NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
