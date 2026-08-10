const url =
  process.env.OBSERVABILITY_SMOKE_URL ||
  "http://127.0.0.1:3000/api/auth/sso-status";

const response = await fetch(url);
const requestId = response.headers.get("x-request-id");
const traceId = response.headers.get("x-trace-id");

if (!requestId) throw new Error("Response is missing x-request-id");
if (!/^[0-9a-f]{32}$/.test(traceId || "")) {
  throw new Error("Response is missing a valid x-trace-id");
}

console.log(
  JSON.stringify({ url, status: response.status, requestId, traceId }, null, 2),
);
