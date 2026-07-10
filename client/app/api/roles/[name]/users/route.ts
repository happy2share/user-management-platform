import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../../lib/keycloak";
import { getKeycloakError } from "../../../../lib/keycloak-users";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const { searchParams } = new URL(req.url);
    const first = searchParams.get("first") || "0";
    const max = searchParams.get("max") || "1000";
    const res = await keycloakAdminFetch(`/roles/${encodeURIComponent(name)}/users?first=${first}&max=${max}`);
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to fetch users in role");
      return NextResponse.json({ error }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch users in role" },
      { status: 500 },
    );
  }
}
