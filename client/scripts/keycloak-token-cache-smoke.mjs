import assert from "node:assert/strict";

process.env.KEYCLOAK_BASE_URL = "http://keycloak.test";
process.env.KEYCLOAK_REALM = "test";
process.env.KEYCLOAK_ADMIN_CLIENT_ID = "test-client";
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET = "test-secret";

let tokenRequests = 0;
let apiRequests = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes("/protocol/openid-connect/token")) {
    tokenRequests += 1;
    return Response.json({ access_token: `token-${tokenRequests}`, expires_in: 60 });
  }

  apiRequests += 1;
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

assert.equal((await keycloakAdminFetch("/users/1")).status, 200);
assert.equal(tokenRequests, 2, "401 must refresh the cached token once");
assert.equal((await keycloakAdminFetch("/users/2")).status, 200);
assert.equal(tokenRequests, 2, "valid cached token must be reused");

console.log("Keycloak admin token cache smoke test passed");
