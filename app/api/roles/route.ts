import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const res = await keycloakAdminFetch("/roles");
    if (!res.ok) return NextResponse.json({ error: await getKeycloakError(res, "Failed to fetch roles") }, { status: res.status });
    const roles = await res.json();
    return NextResponse.json(roles.filter((r: { name?: string }) => !r.name?.startsWith("default-roles-")));
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch roles" }, { status: 500 });
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

    if (!res.ok) return NextResponse.json({ error: await getKeycloakError(res, "Failed to create role") }, { status: res.status });
    return NextResponse.json({ message: "Role created successfully" }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create role" }, { status: 500 });
  }
}
