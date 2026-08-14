import assert from "node:assert/strict";

process.env.KEYCLOAK_BASE_URL = "http://keycloak.test";
process.env.KEYCLOAK_REALM = "test";
process.env.KEYCLOAK_ADMIN_CLIENT_ID = "test-client";
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET = "test-secret";

let tokenRequests = 0;
let apiRequests = 0;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes("/protocol/openid-connect/token")) {
    tokenRequests += 1;
    return Response.json({ access_token: `token-${tokenRequests}`, expires_in: 60 });
  }

  apiRequests += 1;
  const headers = new Headers(options.headers);
  const expectedToken = apiRequests === 1 ? "token-1" : "token-2";
  assert.equal(headers.get("Authorization"), `Bearer ${expectedToken}`);
  assert.equal(headers.get("X-Smoke-Test"), "preserved");
  if (apiRequests === 1) return new Response(null, { status: 401 });
  return Response.json({ ok: true });
};

const { getAdminAccessToken, keycloakAdminFetch } = await import(
  `../app/lib/keycloak.js?cache-smoke=${Date.now()}`
);

const tokens = await Promise.all([
  getAdminAccessToken(),
  getAdminAccessToken(),
  getAdminAccessToken(),
]);
assert.deepEqual(tokens, ["token-1", "token-1", "token-1"]);
assert.equal(tokenRequests, 1);

assert.equal(
  (
    await keycloakAdminFetch("/users/1", {
      headers: [
        ["Authorization", "Bearer caller-token"],
        ["X-Smoke-Test", "preserved"],
      ],
    })
  ).status,
  200,
);
assert.equal(tokenRequests, 2, "401 must refresh the cached token once");
assert.equal(
  (
    await keycloakAdminFetch("/users/2", {
      headers: new Headers({ "X-Smoke-Test": "preserved" }),
    })
  ).status,
  200,
);
assert.equal(tokenRequests, 2, "valid cached token must be reused");

globalThis.fetch = async () =>
  Response.json({ access_token: "", expires_in: 60 });
const invalidTokenModule = await import(
  `../app/lib/keycloak.js?invalid-token-smoke=${Date.now()}`
);
await assert.rejects(
  invalidTokenModule.getAdminAccessToken(),
  /admin token response was invalid/,
);

globalThis.fetch = async () =>
  Response.json({ access_token: "token", expires_in: "60" });
const invalidExpiryModule = await import(
  `../app/lib/keycloak.js?invalid-expiry-smoke=${Date.now()}`
);
await assert.rejects(
  invalidExpiryModule.getAdminAccessToken(),
  /admin token response was invalid/,
);

console.log("Keycloak admin token cache smoke test passed");
