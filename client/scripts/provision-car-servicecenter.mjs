import nextEnv from "@next/env";
import fs from "node:fs";
import path from "node:path";
import { logError, logInfo } from "../app/lib/file-logger.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function forceLoadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    process.env[key] = value;
  }
}

forceLoadLocalEnv();

const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || "http://localhost:8080";
const BOOTSTRAP_REALM = process.env.KEYCLOAK_BOOTSTRAP_REALM || "master";
const BOOTSTRAP_CLIENT_ID = process.env.KEYCLOAK_BOOTSTRAP_CLIENT_ID || "admin-cli";
const BOOTSTRAP_USERNAME = process.env.KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME;
const BOOTSTRAP_PASSWORD = process.env.KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD;

const REALM = process.env.CAR_SERVICE_REALM || "Car_ServiceCenter";
const FRONTEND_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "iam-frontend";
const FRONTEND_CLIENT_SECRET =
  process.env.KEYCLOAK_CLIENT_SECRET || "iam-frontend-client-secret";
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || "iam-admin-api";
const ADMIN_CLIENT_SECRET =
  process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || "iam-admin-api-client-secret";
const PASSWORD_CHECK_CLIENT_ID =
  process.env.KEYCLOAK_PASSWORD_CHECK_CLIENT_ID || "iam-password-check";
const PASSWORD_CHECK_CLIENT_SECRET =
  process.env.KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET ||
  "iam-password-check-client-secret";
const APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
const DEFAULT_PASSWORD = process.env.CAR_SERVICE_DEFAULT_PASSWORD || "ChangeMe@123";

const roles = [
  { name: "realm-admin", description: "Can access the IAM admin portal" },
  { name: "app-user", description: "Default portal role for self-registered users" },
  { name: "owner", description: "Full service center ownership access" },
  { name: "service-manager", description: "Manages workshop operations and staff" },
  { name: "senior-technician", description: "Leads technical diagnostics and reviews work" },
  { name: "technician", description: "Performs and updates service tasks" },
  { name: "helper-apprentice", description: "Limited apprentice workshop access" },
];

const roleComposites = {
  owner: ["service-manager", "realm-admin"],
  "service-manager": ["senior-technician"],
  "senior-technician": ["technician"],
  technician: ["helper-apprentice"],
};

const users = [
  {
    username: "owner.one",
    firstName: "Owner",
    lastName: "One",
    email: "owner.one@car-service.local",
    roles: ["owner", "realm-admin"],
  },
  {
    username: "manager.one",
    firstName: "Service",
    lastName: "Manager",
    email: "manager.one@car-service.local",
    roles: ["service-manager"],
  },
  {
    username: "senior.tech",
    firstName: "Senior",
    lastName: "Technician",
    email: "senior.tech@car-service.local",
    roles: ["senior-technician"],
  },
  {
    username: "mechanic.one",
    firstName: "Mechanic",
    lastName: "One",
    email: "mechanic.one@car-service.local",
    roles: ["technician"],
  },
  {
    username: "helper.one",
    firstName: "Helper",
    lastName: "One",
    email: "helper.one@car-service.local",
    roles: ["helper-apprentice"],
  },
];

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function request(path, options = {}) {
  const response = await fetch(`${KEYCLOAK_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok && !options.allowFailure) {
    const text = await response.text();
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${text}`);
  }

  return response;
}

async function getBootstrapToken() {
  const body = new URLSearchParams();
  body.append("grant_type", "password");
  body.append("client_id", BOOTSTRAP_CLIENT_ID);
  body.append("username", required(BOOTSTRAP_USERNAME, "KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME"));
  body.append("password", required(BOOTSTRAP_PASSWORD, "KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD"));

  const response = await fetch(
    `${KEYCLOAK_BASE_URL}/realms/${BOOTSTRAP_REALM}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Failed to get bootstrap admin token");
  }

  return data.access_token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function ensureRealm(token) {
  const existing = await request(`/admin/realms/${REALM}`, {
    headers: authHeaders(token),
    allowFailure: true,
  });

  if (existing.ok) {
    void logInfo(`Realm exists: ${REALM}`);
    return;
  }

  await request("/admin/realms", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      realm: REALM,
      displayName: "Car Service Center",
      enabled: true,
      loginWithEmailAllowed: true,
      registrationAllowed: false,
      resetPasswordAllowed: true,
      verifyEmail: false,
      rememberMe: true,
      editUsernameAllowed: true,
    }),
  });
  void logInfo(`Realm created: ${REALM}`);
}

async function getClient(token, clientId) {
  const response = await request(
    `/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers: authHeaders(token) },
  );
  const clients = await response.json();
  return clients[0];
}

async function ensureClient(token, clientId, secret, serviceAccountEnabled) {
  const existing = await getClient(token, clientId);
  const config = {
    clientId,
    enabled: true,
    protocol: "openid-connect",
    publicClient: false,
    bearerOnly: false,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: true,
    serviceAccountsEnabled: serviceAccountEnabled,
    secret,
    redirectUris: [`${APP_URL}/*`],
    webOrigins: [APP_URL],
  };

  if (existing?.id) {
    await request(`/admin/realms/${REALM}/clients/${existing.id}`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ ...existing, ...config }),
    });
    void logInfo(`Client updated: ${clientId}`);
    return getClient(token, clientId);
  }

  await request(`/admin/realms/${REALM}/clients`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(config),
  });
  void logInfo(`Client created: ${clientId}`);
  return getClient(token, clientId);
}

async function ensureRole(token, role) {
  const existing = await request(
    `/admin/realms/${REALM}/roles/${encodeURIComponent(role.name)}`,
    { headers: authHeaders(token), allowFailure: true },
  );

  if (existing.ok) {
    await request(`/admin/realms/${REALM}/roles/${encodeURIComponent(role.name)}`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(role),
    });
    void logInfo(`Role updated: ${role.name}`);
    return;
  }

  await request(`/admin/realms/${REALM}/roles`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(role),
  });
  void logInfo(`Role created: ${role.name}`);
}

async function ensureGroup(token) {
  const response = await request(`/admin/realms/${REALM}/groups?search=Service%20Center%20Staff`, {
    headers: authHeaders(token),
  });
  const groups = await response.json();
  if (groups.some((group) => group.name === "Service Center Staff")) {
    void logInfo("Group exists: Service Center Staff");
    return;
  }

  await request(`/admin/realms/${REALM}/groups`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name: "Service Center Staff" }),
  });
  void logInfo("Group created: Service Center Staff");
}

async function getRealmRole(token, roleName) {
  const response = await request(`/admin/realms/${REALM}/roles/${encodeURIComponent(roleName)}`, {
    headers: authHeaders(token),
  });
  return response.json();
}

async function ensureRoleComposites(token) {
  for (const [roleName, childRoleNames] of Object.entries(roleComposites)) {
    const childRoles = await Promise.all(
      childRoleNames.map((childRoleName) => getRealmRole(token, childRoleName)),
    );

    await request(`/admin/realms/${REALM}/roles/${encodeURIComponent(roleName)}/composites`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(childRoles),
    });

    void logInfo(`Composite roles assigned to ${roleName}: ${childRoleNames.join(", ")}`);
  }
}

async function ensureUser(token, user) {
  const lookup = await request(
    `/admin/realms/${REALM}/users?username=${encodeURIComponent(user.username)}&exact=true`,
    { headers: authHeaders(token) },
  );
  const existingUsers = await lookup.json();
  let userId = existingUsers[0]?.id;

  const payload = {
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    enabled: true,
    emailVerified: true,
    attributes: {
      onboardingStatus: ["READY"],
      emailVerificationStatus: ["VERIFIED"],
      appMfaConfigured: ["false"],
    },
  };

  if (userId) {
    await request(`/admin/realms/${REALM}/users/${userId}`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    void logInfo(`User updated: ${user.username}`);
  } else {
    const createResponse = await request(`/admin/realms/${REALM}/users`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        ...payload,
        credentials: [{ type: "password", value: DEFAULT_PASSWORD, temporary: true }],
      }),
    });
    userId = createResponse.headers.get("location")?.split("/").pop();
    void logInfo(`User created: ${user.username}`);
  }

  const roleRepresentations = await Promise.all(
    user.roles.map((roleName) => getRealmRole(token, roleName)),
  );
  await request(`/admin/realms/${REALM}/users/${userId}/role-mappings/realm`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(roleRepresentations),
  });
  void logInfo(`Roles assigned to ${user.username}: ${user.roles.join(", ")}`);
}

async function assignAdminServiceRoles(token, adminClient) {
  const serviceAccountResponse = await request(
    `/admin/realms/${REALM}/clients/${adminClient.id}/service-account-user`,
    { headers: authHeaders(token) },
  );
  const serviceAccount = await serviceAccountResponse.json();

  const realmManagement = await getClient(token, "realm-management");
  const rolesResponse = await request(
    `/admin/realms/${REALM}/clients/${realmManagement.id}/roles`,
    { headers: authHeaders(token) },
  );
  const managementRoles = await rolesResponse.json();
  const requiredRoleNames = [
    "realm-admin",
    "view-realm",
    "manage-realm",
    "view-events",
    "view-users",
    "query-users",
    "manage-users",
    "view-clients",
    "manage-clients",
    "view-authorization",
    "manage-authorization",
  ];
  const requiredRoles = managementRoles.filter((role) => requiredRoleNames.includes(role.name));

  await request(
    `/admin/realms/${REALM}/users/${serviceAccount.id}/role-mappings/clients/${realmManagement.id}`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(requiredRoles),
    },
  );
  void logInfo(`Admin service roles assigned: ${requiredRoles.map((role) => role.name).join(", ")}`);
}

async function main() {
  const token = await getBootstrapToken();
  await ensureRealm(token);

  await ensureClient(token, FRONTEND_CLIENT_ID, FRONTEND_CLIENT_SECRET, false);
  await ensureClient(
    token,
    PASSWORD_CHECK_CLIENT_ID,
    PASSWORD_CHECK_CLIENT_SECRET,
    false,
  );
  const adminClient = await ensureClient(token, ADMIN_CLIENT_ID, ADMIN_CLIENT_SECRET, true);
  await assignAdminServiceRoles(token, adminClient);

  for (const role of roles) {
    await ensureRole(token, role);
  }

  await ensureRoleComposites(token);

  await ensureGroup(token);

  for (const user of users) {
    await ensureUser(token, user);
  }

  void logInfo("Car_ServiceCenter provisioning complete.");
  void logInfo("Use these values in .env.local:");
  void logInfo(`KEYCLOAK_REALM=${REALM}`);
  void logInfo(`KEYCLOAK_CLIENT_ID=${FRONTEND_CLIENT_ID}`);
  void logInfo("KEYCLOAK_CLIENT_SECRET=[redacted]");
  void logInfo(`KEYCLOAK_ADMIN_CLIENT_ID=${ADMIN_CLIENT_ID}`);
  void logInfo("KEYCLOAK_ADMIN_CLIENT_SECRET=[redacted]");
  void logInfo(`KEYCLOAK_PASSWORD_CHECK_CLIENT_ID=${PASSWORD_CHECK_CLIENT_ID}`);
  void logInfo("KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET=[redacted]");
  void logInfo("Seed user password=[redacted]");
}

main().catch((error) => {
  void logError("Car service provisioning failed", {
    script: "provision-car-servicecenter",
    operation: "carService.provision",
    realm: REALM,
    error,
  });
  process.exitCode = 1;
});
