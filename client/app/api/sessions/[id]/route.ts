import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { getKeycloakError } from "../../../lib/keycloak-users";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const results: string[] = [];

    const bySession = await keycloakAdminFetch(
      `/sessions/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );

    if (bySession.ok) {
      results.push("specific session revoked");
    }

    if (userId) {
      const byUser = await keycloakAdminFetch(
        `/users/${encodeURIComponent(userId)}/logout`,
        { method: "POST" },
      );

      if (!byUser.ok) {
        return NextResponse.json(
          { error: await getKeycloakError(byUser, "Failed to fully logout user from Keycloak") },
          { status: byUser.status },
        );
      }

      results.push("all user sessions revoked");
    }

    if (results.length > 0) {
      return NextResponse.json({ message: results.join("; ") });
    }

    return NextResponse.json(
      { error: await getKeycloakError(bySession, "Failed to revoke session") },
      { status: bySession.status },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: await getKeycloakError(error, "Failed to revoke session") },
      { status: 500 },
    );
  }
}
