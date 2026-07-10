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
const REALM = process.env.KEYCLOAK_REALM || "Car_ServiceCenter";
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || "iam-admin-api";
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

const carRoles = [
  ["app-user", "Default self-registered portal user"],
  ["realm-admin", "Application admin gate for the IAM portal"],
  ["helper-apprentice", "Helpers and apprentices with basic workshop access"],
  ["technician", "Technicians and mechanics handling assigned repair work"],
  ["senior-technician", "Senior technicians supervising diagnostics and repair quality"],
  ["service-manager", "Workshop/service managers handling staff and workshop operations"],
  ["owner", "Service-center owner with full operational and IAM oversight"],
];

const realmRoleComposites = {
  technician: ["helper-apprentice"],
  "senior-technician": ["technician"],
  "service-manager": ["senior-technician"],
  owner: ["service-manager", "realm-admin"],
};

const realmManagementComposites = {
  owner: [
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
  ],
  "service-manager": ["view-users", "query-users", "manage-users", "view-groups"],
  "senior-technician": ["view-users", "query-users", "view-groups"],
  technician: [],
  "helper-apprentice": [],
};

const adminServiceAccountRoleNames = [
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

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function keycloak(path, options = {}) {
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

async function getAdminToken() {
  const body = new URLSearchParams();
  body.append("grant_type", "client_credentials");
  body.append("client_id", ADMIN_CLIENT_ID);
  body.append("client_secret", requireValue(ADMIN_CLIENT_SECRET, "KEYCLOAK_ADMIN_CLIENT_SECRET"));

  const response = await fetch(
    `${KEYCLOAK_BASE_URL}/realms/${REALM}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Failed to get admin token");
  }

  return data.access_token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function getRealmRole(token, roleName) {
  const response = await keycloak(`/admin/realms/${REALM}/roles/${encodeURIComponent(roleName)}`, {
    headers: auth(token),
  });
  return response.json();
}

async function ensureRealmRole(token, name, description) {
  const existing = await keycloak(`/admin/realms/${REALM}/roles/${encodeURIComponent(name)}`, {
    headers: auth(token),
    allowFailure: true,
  });

  if (existing.ok) {
    await keycloak(`/admin/realms/${REALM}/roles/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: auth(token),
      body: JSON.stringify({ name, description }),
    });
    void logInfo(`Role updated: ${name}`);
    return;
  }

  await keycloak(`/admin/realms/${REALM}/roles`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ name, description }),
  });
  void logInfo(`Role created: ${name}`);
}

async function getClientByClientId(token, clientId) {
  const response = await keycloak(
    `/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers: auth(token) },
  );
  const clients = await response.json();
  return clients[0];
}

async function getClientRole(token, clientUuid, roleName) {
  const response = await keycloak(
    `/admin/realms/${REALM}/clients/${encodeURIComponent(clientUuid)}/roles/${encodeURIComponent(roleName)}`,
    { headers: auth(token), allowFailure: true },
  );
  if (!response.ok) return null;
  return response.json();
}

async function addRealmRoleComposites(token) {
  for (const [parentRole, childRoleNames] of Object.entries(realmRoleComposites)) {
    const childRoles = await Promise.all(
      childRoleNames.map((roleName) => getRealmRole(token, roleName)),
    );

    await keycloak(`/admin/realms/${REALM}/roles/${encodeURIComponent(parentRole)}/composites`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify(childRoles),
    });
    void logInfo(`${parentRole} realm composites: ${childRoleNames.join(", ")}`);
  }
}

async function addRealmManagementComposites(token) {
  const realmManagement = await getClientByClientId(token, "realm-management");
  if (!realmManagement?.id) {
    throw new Error("realm-management client not found");
  }

  for (const [parentRole, managementRoleNames] of Object.entries(realmManagementComposites)) {
    if (managementRoleNames.length === 0) {
      void logInfo(`${parentRole} realm-management composites: none`);
      continue;
    }

    const roles = (
      await Promise.all(
        managementRoleNames.map((roleName) =>
          getClientRole(token, realmManagement.id, roleName),
        ),
      )
    ).filter(Boolean);

    const missing = managementRoleNames.filter(
      (roleName) => !roles.some((role) => role.name === roleName),
    );
    if (missing.length > 0) {
      void logInfo(`${parentRole} skipped missing realm-management roles: ${missing.join(", ")}`);
    }

    if (roles.length === 0) continue;

    await keycloak(`/admin/realms/${REALM}/roles/${encodeURIComponent(parentRole)}/composites`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify(roles),
    });
    void logInfo(`${parentRole} realm-management composites: ${roles.map((role) => role.name).join(", ")}`);
  }
}

async function addAdminServiceAccountRoles(token) {
  const adminClient = await getClientByClientId(token, ADMIN_CLIENT_ID);
  if (!adminClient?.id) {
    throw new Error(`${ADMIN_CLIENT_ID} client not found`);
  }

  const serviceAccountResponse = await keycloak(
    `/admin/realms/${REALM}/clients/${encodeURIComponent(adminClient.id)}/service-account-user`,
    { headers: auth(token) },
  );
  const serviceAccount = await serviceAccountResponse.json();

  const realmManagement = await getClientByClientId(token, "realm-management");
  if (!realmManagement?.id) {
    throw new Error("realm-management client not found");
  }

  const roles = (
    await Promise.all(
      adminServiceAccountRoleNames.map((roleName) =>
        getClientRole(token, realmManagement.id, roleName),
      ),
    )
  ).filter(Boolean);

  const missing = adminServiceAccountRoleNames.filter(
    (roleName) => !roles.some((role) => role.name === roleName),
  );
  if (missing.length > 0) {
    void logInfo(`Admin service account skipped missing realm-management roles: ${missing.join(", ")}`);
  }

  if (roles.length === 0) {
    void logInfo("Admin service account realm-management roles: none");
    return;
  }

  await keycloak(
    `/admin/realms/${REALM}/users/${encodeURIComponent(serviceAccount.id)}/role-mappings/clients/${encodeURIComponent(realmManagement.id)}`,
    {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify(roles),
    },
  );
  void logInfo(`Admin service account realm-management roles: ${roles.map((role) => role.name).join(", ")}`);
}

async function main() {
  const token = await getAdminToken();

  for (const [name, description] of carRoles) {
    await ensureRealmRole(token, name, description);
  }

  await addRealmRoleComposites(token);
  await addRealmManagementComposites(token);
  await addAdminServiceAccountRoles(token);

  void logInfo(`Keycloak role permissions configured in realm: ${REALM}`);
}

main().catch((error) => {
  void logError("Car service permissions configuration failed", {
    script: "configure-car-servicecenter-permissions",
    operation: "carService.permissions.configure",
    realm: REALM,
    error,
  });
  process.exitCode = 1;
});
