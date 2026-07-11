import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../lib/api-auth";
import { commonEntryLog } from "../../lib/app-utilities";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

type KeycloakClient = {
  id?: string;
  clientId?: string;
  name?: string;
  description?: string;
  protocol?: string;
  publicClient?: boolean;
  serviceAccountsEnabled?: boolean;
  enabled?: boolean;
  redirectUris?: string[];
  standardFlowEnabled?: boolean;
  directAccessGrantsEnabled?: boolean;
  rootUrl?: string;
  baseUrl?: string;
};

function normalizeClient(c: KeycloakClient) {
  return {
    id: c.id,
    clientId: c.clientId,
    name: c.name,
    description: c.description,
    protocol: c.protocol,
    publicClient: c.publicClient,
    serviceAccountsEnabled: c.serviceAccountsEnabled,
    enabled: c.enabled,
    redirectUris: c.redirectUris ?? [],
    standardFlowEnabled: c.standardFlowEnabled,
    directAccessGrantsEnabled: c.directAccessGrantsEnabled,
    rootUrl: c.rootUrl,
    baseUrl: c.baseUrl,
  };
}

export async function GET(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;
  await commonEntryLog(req);

  try {
    const res = await keycloakAdminFetch("/clients");
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to fetch clients");
      return NextResponse.json({ error }, { status: res.status });
    }
    const clients = (await res.json()) as KeycloakClient[];
    return NextResponse.json(clients.map(normalizeClient));
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch clients",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;
  await commonEntryLog(req);

  try {
    const body = await req.json();
    const clientId = String(body.clientId || "").trim();
    if (!clientId) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const payload = {
      clientId,
      name: String(body.name || "").trim(),
      description: String(body.description || "").trim(),
      protocol: body.protocol || "openid-connect",
      enabled: body.enabled !== false,
      publicClient: body.publicClient !== false,
      standardFlowEnabled: body.standardFlowEnabled !== false,
      directAccessGrantsEnabled: Boolean(body.directAccessGrantsEnabled),
      serviceAccountsEnabled: Boolean(body.serviceAccountsEnabled),
      redirectUris: Array.isArray(body.redirectUris) ? body.redirectUris : [],
      rootUrl: body.rootUrl || "",
      baseUrl: body.baseUrl || "",
    };

    const res = await keycloakAdminFetch("/clients", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to create client");
      return NextResponse.json({ error }, { status: res.status });
    }

    return NextResponse.json({ message: "Client created successfully" }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create client" },
      { status: 500 },
    );
  }
}
