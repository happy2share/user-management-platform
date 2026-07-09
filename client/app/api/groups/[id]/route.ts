import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { getKeycloakError } from "../../../lib/keycloak-users";

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
        { error: await getKeycloakError(res, "Failed to delete group") },
        { status: res.status },
      );
    }

    return NextResponse.json({
      message: "Group deleted successfully",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: await getKeycloakError(err, "Failed to delete group") },
      { status: 500 },
    );
  }
}
