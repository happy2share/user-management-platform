import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { getKeycloakError } from "../../../lib/keycloak-users";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const res = await keycloakAdminFetch(`/clients/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to fetch client");
      return NextResponse.json({ error }, { status: res.status });
    }

    return NextResponse.json(await res.json());
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch client" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const res = await keycloakAdminFetch(`/clients/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to update client");
      return NextResponse.json({ error }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update client" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const res = await keycloakAdminFetch(`/clients/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to delete client");
      return NextResponse.json({ error }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete client" },
      { status: 500 },
    );
  }
}
