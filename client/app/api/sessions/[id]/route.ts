import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { getKeycloakError } from "../../../lib/keycloak-users";
import { invalidateUserSessions } from "../../../lib/activation";

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
      await invalidateUserSessions(userId);
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
