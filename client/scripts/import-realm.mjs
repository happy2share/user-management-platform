import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { logError, logInfo } from "../app/lib/file-logger.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

function configFromEnv(env = process.env) {
  return {
    keycloakBaseUrl: env.KEYCLOAK_BASE_URL || "http://localhost:8080",
    bootstrapRealm: env.KEYCLOAK_BOOTSTRAP_REALM || "master",
    bootstrapClientId: env.KEYCLOAK_BOOTSTRAP_CLIENT_ID || "admin-cli",
    bootstrapUsername: env.KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME || "admin",
    bootstrapPassword: env.KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD || "",
    realmFile: env.REALM_FILE || "realm.json",
    overwriteRealm: env.OVERWRITE_REALM === "true",
    realmName: env.REALM_NAME || env.KEYCLOAK_REALM || "",
    displayName: env.REALM_DISPLAY_NAME || "",
    frontendClientId: env.FRONTEND_CLIENT_ID || env.KEYCLOAK_CLIENT_ID || "",
    frontendClientSecret: env.FRONTEND_CLIENT_SECRET || env.KEYCLOAK_CLIENT_SECRET || "",
    adminClientId: env.ADMIN_CLIENT_ID || env.KEYCLOAK_ADMIN_CLIENT_ID || "",
    adminClientSecret: env.ADMIN_CLIENT_SECRET || env.KEYCLOAK_ADMIN_CLIENT_SECRET || "",
    passwordCheckClientId:
      env.PASSWORD_CHECK_CLIENT_ID || env.KEYCLOAK_PASSWORD_CHECK_CLIENT_ID || "",
    passwordCheckClientSecret:
      env.PASSWORD_CHECK_CLIENT_SECRET || env.KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET || "",
    staffGroupName: env.STAFF_GROUP_NAME || "",
    roles: {
      realmAdmin: env.ROLE_REALM_ADMIN || "",
      appUser: env.ROLE_APP_USER || "",
      owner: env.ROLE_OWNER || "",
      serviceManager: env.ROLE_SERVICE_MANAGER || "",
      seniorTechnician: env.ROLE_SENIOR_TECHNICIAN || "",
      technician: env.ROLE_TECHNICIAN || "",
      helperApprentice: env.ROLE_HELPER_APPRENTICE || "",
    },
  };
}

async function promptWithDefault(rl, label, defaultValue, options = {}) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const value = await rl.question(`${label}${suffix}: `);
  const trimmed = value.trim();

  if (!trimmed && options.required && !defaultValue) {
    return promptWithDefault(rl, label, defaultValue, options);
  }

  return trimmed || defaultValue;
}

async function promptForConfig(config) {
  if (process.env.NON_INTERACTIVE === "true") return config;
  if (!process.stdin.isTTY) return config;

  const rl = readline.createInterface({ input, output });

  try {
    void logInfo("Keycloak import setup");
    void logInfo("Press Enter to accept defaults.");

    const nextConfig = { ...config, roles: { ...config.roles } };

    nextConfig.keycloakBaseUrl = await promptWithDefault(
      rl,
      "Keycloak base URL",
      nextConfig.keycloakBaseUrl,
      { required: true },
    );
    nextConfig.bootstrapRealm = await promptWithDefault(
      rl,
      "Admin/bootstrap realm",
      nextConfig.bootstrapRealm,
      { required: true },
    );
    nextConfig.bootstrapUsername = await promptWithDefault(
      rl,
      "Admin username",
      nextConfig.bootstrapUsername,
      { required: true },
    );
    nextConfig.bootstrapPassword = await promptWithDefault(
      rl,
      "Admin password",
      nextConfig.bootstrapPassword,
      { required: true },
    );
    nextConfig.realmName = await promptWithDefault(
      rl,
      "New business realm name",
      nextConfig.realmName || "Car_ServiceCenter",
      { required: true },
    );
    nextConfig.displayName = await promptWithDefault(
      rl,
      "Realm display name",
      nextConfig.displayName || "Car Service Center",
      { required: true },
    );
    nextConfig.frontendClientId = await promptWithDefault(
      rl,
      "Frontend client ID",
      nextConfig.frontendClientId || "iam-frontend",
      { required: true },
    );
    nextConfig.frontendClientSecret = await promptWithDefault(
      rl,
      "Frontend client secret",
      nextConfig.frontendClientSecret || "iam-frontend-client-secret",
      { required: true },
    );
    nextConfig.adminClientId = await promptWithDefault(
      rl,
      "Admin API client ID",
      nextConfig.adminClientId || "iam-admin-api",
      { required: true },
    );
    nextConfig.adminClientSecret = await promptWithDefault(
      rl,
      "Admin API client secret",
      nextConfig.adminClientSecret || "iam-admin-api-client-secret",
      { required: true },
    );
    nextConfig.passwordCheckClientId = await promptWithDefault(
      rl,
      "Password-check client ID",
      nextConfig.passwordCheckClientId || "iam-password-check",
      { required: true },
    );
    nextConfig.passwordCheckClientSecret = await promptWithDefault(
      rl,
      "Password-check client secret",
      nextConfig.passwordCheckClientSecret || "iam-password-check-client-secret",
      { required: true },
    );
    nextConfig.staffGroupName = await promptWithDefault(
      rl,
      "Main staff group name",
      nextConfig.staffGroupName || "Service Center Staff",
      { required: true },
    );

    void logInfo("Role names");
    nextConfig.roles.realmAdmin = await promptWithDefault(
      rl,
      "Admin portal role",
      nextConfig.roles.realmAdmin || "realm-admin",
      { required: true },
    );
    nextConfig.roles.appUser = await promptWithDefault(
      rl,
      "Default app user role",
      nextConfig.roles.appUser || "app-user",
      { required: true },
    );
    nextConfig.roles.owner = await promptWithDefault(
      rl,
      "Owner role",
      nextConfig.roles.owner || "owner",
      { required: true },
    );
    nextConfig.roles.serviceManager = await promptWithDefault(
      rl,
      "Service manager role",
      nextConfig.roles.serviceManager || "service-manager",
      { required: true },
    );
    nextConfig.roles.seniorTechnician = await promptWithDefault(
      rl,
      "Senior technician role",
      nextConfig.roles.seniorTechnician || "senior-technician",
      { required: true },
    );
    nextConfig.roles.technician = await promptWithDefault(
      rl,
      "Technician role",
      nextConfig.roles.technician || "technician",
      { required: true },
    );
    nextConfig.roles.helperApprentice = await promptWithDefault(
      rl,
      "Helper/apprentice role",
      nextConfig.roles.helperApprentice || "helper-apprentice",
      { required: true },
    );

    return nextConfig;
  } finally {
    rl.close();
  }
}

function replaceRoleName(value, roleMap) {
  return roleMap[value] || value;
}

function rewriteRoleArray(values = [], roleMap) {
  return values.map((value) => replaceRoleName(value, roleMap));
}

function rewriteGroup(group, roleMap, staffGroupName) {
  const rewritten = {
    ...group,
    name: group.name === "Service Center Staff" ? staffGroupName : group.name,
    realmRoles: rewriteRoleArray(group.realmRoles || [], roleMap),
    subGroups: (group.subGroups || []).map((subGroup) =>
      rewriteGroup(subGroup, roleMap, staffGroupName),
    ),
  };

  rewritten.path = `/${rewritten.name}`;
  if (group.path?.startsWith("/Service Center Staff/")) {
    rewritten.path = group.path.replace("/Service Center Staff", `/${staffGroupName}`);
  }

  return rewritten;
}

function customizeRealm(template, config) {
  const roleMap = {
    "realm-admin": config.roles.realmAdmin || "realm-admin",
    "app-user": config.roles.appUser || "app-user",
    owner: config.roles.owner || "owner",
    "service-manager": config.roles.serviceManager || "service-manager",
    "senior-technician": config.roles.seniorTechnician || "senior-technician",
    technician: config.roles.technician || "technician",
    "helper-apprentice": config.roles.helperApprentice || "helper-apprentice",
  };

  const clientMap = {
    "iam-frontend": config.frontendClientId || "iam-frontend",
    "iam-admin-api": config.adminClientId || "iam-admin-api",
    "iam-password-check": config.passwordCheckClientId || "iam-password-check",
  };

  const secretMap = {
    [clientMap["iam-frontend"]]:
      config.frontendClientSecret || "iam-frontend-client-secret",
    [clientMap["iam-admin-api"]]:
      config.adminClientSecret || "iam-admin-api-client-secret",
    [clientMap["iam-password-check"]]:
      config.passwordCheckClientSecret || "iam-password-check-client-secret",
  };

  const realm = structuredClone(template);
  realm.realm = config.realmName || template.realm;
  realm.displayName = config.displayName || template.displayName;

  realm.roles.realm = realm.roles.realm.map((role) => {
    const name = replaceRoleName(role.name, roleMap);
    const composites = role.composites?.realm
      ? { realm: rewriteRoleArray(role.composites.realm, roleMap) }
      : role.composites;

    return {
      ...role,
      name,
      ...(composites ? { composites } : {}),
    };
  });

  realm.groups = (realm.groups || []).map((group) =>
    rewriteGroup(group, roleMap, config.staffGroupName || "Service Center Staff"),
  );

  realm.clients = realm.clients.map((client) => {
    const clientId = clientMap[client.clientId] || client.clientId;
    return {
      ...client,
      clientId,
      secret: secretMap[clientId] || client.secret,
    };
  });

  realm.users = (realm.users || []).map((user) => {
    if (user.serviceAccountClientId !== "iam-admin-api") return user;

    return {
      ...user,
      username: `service-account-${clientMap["iam-admin-api"]}`,
      serviceAccountClientId: clientMap["iam-admin-api"],
    };
  });

  return realm;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  return {
    response,
    data: await readResponse(response),
  };
}

export async function importRealm(config = configFromEnv()) {
  if (!config.bootstrapPassword) {
    throw new Error("Set KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD before running");
  }

  const realmPath = path.resolve(
    projectRoot,
    config.realmFile,
  );

  if (!fs.existsSync(realmPath)) {
    throw new Error(`Realm file not found: ${realmPath}`);
  }

  const realmTemplate = JSON.parse(fs.readFileSync(realmPath, "utf8"));
  const realm = customizeRealm(realmTemplate, config);
  if (!realm.realm) {
    throw new Error(`Realm name is missing in ${realmPath}`);
  }

  const tokenBody = new URLSearchParams();
  tokenBody.set("grant_type", "password");
  tokenBody.set("client_id", config.bootstrapClientId);
  tokenBody.set("username", config.bootstrapUsername);
  tokenBody.set("password", config.bootstrapPassword);

  const tokenUrl = `${config.keycloakBaseUrl}/realms/${config.bootstrapRealm}/protocol/openid-connect/token`;
  const tokenResult = await request(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });

  if (!tokenResult.response.ok || !tokenResult.data.access_token) {
    throw new Error(
      tokenResult.data.error_description ||
        tokenResult.data.error ||
        `Failed to get Keycloak admin token: HTTP ${tokenResult.response.status}`,
    );
  }

  const authorization = `Bearer ${tokenResult.data.access_token}`;
  const realmUrl = `${config.keycloakBaseUrl}/admin/realms/${encodeURIComponent(realm.realm)}`;
  const existing = await fetch(realmUrl, {
    headers: { Authorization: authorization },
  });

  if (existing.status === 200) {
    if (!config.overwriteRealm) {
      throw new Error(
        `Realm ${realm.realm} already exists. Set OVERWRITE_REALM=true to delete and re-import it.`,
      );
    }

    const deleted = await fetch(realmUrl, {
      method: "DELETE",
      headers: { Authorization: authorization },
    });

    if (deleted.status !== 204) {
      throw new Error(`Delete failed with HTTP ${deleted.status}`);
    }
  } else if (existing.status !== 404) {
    throw new Error(`Realm existence check failed with HTTP ${existing.status}`);
  }

  const importResult = await request(`${config.keycloakBaseUrl}/admin/realms`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(realm),
  });

  if (![201, 204].includes(importResult.response.status)) {
    const details = importResult.data.text || JSON.stringify(importResult.data);
    throw new Error(`Realm import failed with HTTP ${importResult.response.status}: ${details}`);
  }

  return {
    realm: realm.realm,
    keycloakBaseUrl: config.keycloakBaseUrl,
    frontendClientId: config.frontendClientId || "iam-frontend",
    frontendClientSecret:
      config.frontendClientSecret || "iam-frontend-client-secret",
    adminClientId: config.adminClientId || "iam-admin-api",
    adminClientSecret: config.adminClientSecret || "iam-admin-api-client-secret",
    passwordCheckClientId: config.passwordCheckClientId || "iam-password-check",
    passwordCheckClientSecret:
      config.passwordCheckClientSecret || "iam-password-check-client-secret",
  };
}

if (scriptPath === path.resolve(process.argv[1] || "")) {
  promptForConfig(configFromEnv())
    .then((config) => importRealm(config))
    .then((result) => {
      void logInfo("Realm import complete.");
      void logInfo("Use these app env values:");
      void logInfo(`KEYCLOAK_BASE_URL=${result.keycloakBaseUrl}`);
      void logInfo(`KEYCLOAK_REALM=${result.realm}`);
      void logInfo(`KEYCLOAK_ISSUER=${result.keycloakBaseUrl}/realms/${result.realm}`);
      void logInfo(`NEXT_PUBLIC_KEYCLOAK_ISSUER=${result.keycloakBaseUrl}/realms/${result.realm}`);
      void logInfo(`KEYCLOAK_CLIENT_ID=${result.frontendClientId}`);
      void logInfo("KEYCLOAK_CLIENT_SECRET=[redacted]");
      void logInfo(`KEYCLOAK_ADMIN_CLIENT_ID=${result.adminClientId}`);
      void logInfo("KEYCLOAK_ADMIN_CLIENT_SECRET=[redacted]");
      void logInfo(`KEYCLOAK_PASSWORD_CHECK_CLIENT_ID=${result.passwordCheckClientId}`);
      void logInfo("KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET=[redacted]");
    })
    .catch((error) => {
      void logError("Realm import failed", {
        script: "import-realm",
        operation: "realm.import",
        error,
      });
      process.exitCode = 1;
    });
}
