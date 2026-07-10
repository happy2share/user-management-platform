import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(
  _req: Request,
  context: RouteContext,
) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    const res = await keycloakAdminFetch(`/groups/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: await res.text() },
        { status: res.status },
      );
    }

    return NextResponse.json({
      message: "Group deleted successfully",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete group" },
      { status: 500 },
    );
  }
}
