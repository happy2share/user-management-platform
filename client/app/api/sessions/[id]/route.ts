import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
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

    if (!bySession.ok) {
      const error = await getKeycloakError(bySession, "Failed to revoke session");
      return NextResponse.json({ error }, { status: bySession.status });
    }
    results.push("specific session revoked");

    if (userId) {
      const byUser = await keycloakAdminFetch(
        `/users/${encodeURIComponent(userId)}/logout`,
        { method: "POST" },
      );

      if (!byUser.ok) {
        const error = await getKeycloakError(byUser, "Failed to fully logout user from Keycloak");
        return NextResponse.json({ error }, { status: byUser.status });
      }

      results.push("all user sessions revoked");
    }

    if (results.length > 0) {
      return NextResponse.json({ message: results.join("; ") });
    }

    const error = await getKeycloakError(bySession, "Failed to revoke session");

    return NextResponse.json({ error }, { status: bySession.status });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revoke session" },
      { status: 500 },
    );
  }
}
