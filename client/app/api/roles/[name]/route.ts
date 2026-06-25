import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { getKeycloakError } from "../../../lib/keycloak-users";

type RouteContext = { params: Promise<{ name: string }> };

export async function PUT(req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const body = await req.json();
    const nextName = body.name?.trim() || name;

    const res = await keycloakAdminFetch(`/roles/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify({ name: nextName, description: body.description?.trim() || "" }),
    });

    if (!res.ok) return NextResponse.json({ error: await getKeycloakError(res, "Failed to update role") }, { status: res.status });
    return NextResponse.json({ message: "Role updated successfully" });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update role" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const res = await keycloakAdminFetch(`/roles/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) return NextResponse.json({ error: await getKeycloakError(res, "Failed to delete role") }, { status: res.status });
    return NextResponse.json({ message: "Role deleted successfully" });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete role" }, { status: 500 });
  }
}
