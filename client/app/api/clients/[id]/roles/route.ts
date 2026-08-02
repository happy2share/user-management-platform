import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../../lib/api-auth";
import { cleanDisplayText } from "../../../../lib/display-text";
import { keycloakAdminFetch } from "../../../../lib/keycloak";
import { getKeycloakError } from "../../../../lib/keycloak-users";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const res = await keycloakAdminFetch(`/clients/${encodeURIComponent(id)}/roles?max=1000`);
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to fetch client roles");
      return NextResponse.json({ error }, { status: res.status });
    }

    const roles = await res.json();
    return NextResponse.json(
      Array.isArray(roles)
        ? roles.map((role) => ({ ...role, description: cleanDisplayText(role.description, "") }))
        : [],
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch client roles" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Role name is required" }, { status: 400 });

    const res = await keycloakAdminFetch(`/clients/${encodeURIComponent(id)}/roles`, {
      method: "POST",
      body: JSON.stringify({
        name,
        description: String(body.description || "").trim(),
      }),
    });

    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to create client role");
      return NextResponse.json({ error }, { status: res.status });
    }

    return NextResponse.json({ message: "Role created successfully" }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create client role" },
      { status: 500 },
    );
  }
}
