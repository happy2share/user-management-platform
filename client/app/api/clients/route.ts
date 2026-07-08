import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

type KeycloakClient = {
  id: string;
  clientId?: string;
  name?: string;
  protocol?: string;
  publicClient?: boolean;
  serviceAccountsEnabled?: boolean;
  enabled?: boolean;
  redirectUris?: string[];
  standardFlowEnabled?: boolean;
  directAccessGrantsEnabled?: boolean;
};

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const res = await keycloakAdminFetch("/clients");
    if (!res.ok)
      return NextResponse.json(
        { error: await getKeycloakError(res, "Failed to fetch clients") },
        { status: res.status },
      );
    const clients = await res.json();
    return NextResponse.json(
      clients.map((c: KeycloakClient) => ({
        id: c.id,
        clientId: c.clientId,
        name: c.name,
        protocol: c.protocol,
        publicClient: c.publicClient,
        serviceAccountsEnabled: c.serviceAccountsEnabled,
        enabled: c.enabled,
        redirectUris: c.redirectUris ?? [],
        standardFlowEnabled: c.standardFlowEnabled,
        directAccessGrantsEnabled: c.directAccessGrantsEnabled,
      })),
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          await getKeycloakError(error, "Failed to fetch clients"),
      },
      { status: 500 },
    );
  }
}
