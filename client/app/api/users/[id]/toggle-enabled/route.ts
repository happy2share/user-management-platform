import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../../lib/api-auth";
import { commonEntryLog } from "../../../../lib/app-utilities";
import { keycloakAdminFetch } from "../../../../lib/keycloak";
import { getKeycloakError } from "../../../../lib/keycloak-users";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    await commonEntryLog(request, { id });

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const currentRes = await keycloakAdminFetch(`/users/${encodeURIComponent(id)}`);
    if (!currentRes.ok) {
      const error = await getKeycloakError(currentRes, "Failed to fetch user");
      return NextResponse.json({ error }, { status: currentRes.status });
    }

    const currentUser = await currentRes.json();
    const nextEnabled = currentUser.enabled === false;

    const updateRes = await keycloakAdminFetch(`/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({
        ...currentUser,
        enabled: nextEnabled,
      }),
    });

    if (!updateRes.ok) {
      const error = await getKeycloakError(updateRes, "Failed to update user status");
      return NextResponse.json({ error }, { status: updateRes.status });
    }

    return NextResponse.json({ enabled: nextEnabled });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update user status",
      },
      { status: 500 },
    );
  }
}

export const POST = PATCH;
