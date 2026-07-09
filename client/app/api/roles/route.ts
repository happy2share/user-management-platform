import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const res = await keycloakAdminFetch("/roles");
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to fetch roles");
      return NextResponse.json({ error }, { status: res.status });
    }
    const roles = await res.json();
    return NextResponse.json(roles.filter((r: { name?: string }) => !r.name?.startsWith("default-roles-")));
  } catch (error: unknown) {
    const message = await getKeycloakError(error, "Failed to fetch roles");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Role name is required" }, { status: 400 });

    const res = await keycloakAdminFetch("/roles", {
      method: "POST",
      body: JSON.stringify({ name, description: body.description?.trim() || "" }),
    });

    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to create role");
      return NextResponse.json({ error }, { status: res.status });
    }
    return NextResponse.json({ message: "Role created successfully" }, { status: 201 });
  } catch (error: unknown) {
    const message = await getKeycloakError(error, "Failed to create role");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
