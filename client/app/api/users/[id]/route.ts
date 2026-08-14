import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../lib/api-auth";
import { commonEntryLog } from "../../../lib/app-utilities";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { normalizeObjectTextFields } from "../../../i18n/english-normalizer";
import {
  getKeycloakError,
  syncUserGroups,
  syncUserRealmRoles,
} from "../../../lib/keycloak-users";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    await commonEntryLog(request, { id });

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const response = await keycloakAdminFetch(`/users/${encodeURIComponent(id)}`);

    if (!response.ok) {
      const error = await getKeycloakError(response, "Failed to fetch user");
      return NextResponse.json({ error }, { status: response.status });
    }

    return NextResponse.json(await response.json());
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch user",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    await commonEntryLog(request, { id });
    const rawBody = await request.json();
    const body = normalizeObjectTextFields(rawBody, [
      "firstName",
      "lastName",
      "username",
      "email",
    ]);
    const { firstName, lastName, username, email, enabled, roles, groups } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const currentRes = await keycloakAdminFetch(`/users/${encodeURIComponent(id)}`);
    if (!currentRes.ok) {
      const error = await getKeycloakError(currentRes, "Failed to fetch user");
      return NextResponse.json({ error }, { status: currentRes.status });
    }
    const currentUser = await currentRes.json();

    const nextUsername = username?.trim() || currentUser.username;
    if (!nextUsername) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 },
      );
    }

    if (roles !== undefined && !Array.isArray(roles)) {
      return NextResponse.json(
        { error: "Roles must be an array" },
        { status: 400 },
      );
    }

    if (groups !== undefined && !Array.isArray(groups)) {
      return NextResponse.json(
        { error: "Groups must be an array" },
        { status: 400 },
      );
    }

    const updatePayload = {
      ...currentUser,
      username: nextUsername,
      email: email !== undefined ? email?.trim() : currentUser.email,
      firstName: firstName !== undefined ? firstName?.trim() : currentUser.firstName,
      lastName: lastName !== undefined ? lastName?.trim() : currentUser.lastName,
      enabled: typeof enabled === "boolean" ? enabled : currentUser.enabled,
    };

    const updateRes = await keycloakAdminFetch(
      `/users/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(updatePayload),
      },
    );

    if (!updateRes.ok) {
      const error = await getKeycloakError(updateRes, "Failed to update user");
      return NextResponse.json({ error }, { status: updateRes.status });
    }

    if (roles !== undefined) {
      await syncUserRealmRoles(id, roles);
    }

    if (groups !== undefined) {
      await syncUserGroups(id, groups);
    }

    return NextResponse.json({ message: "User updated successfully" });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update user",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    await commonEntryLog(request, { id });

    if (!id) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    const response = await keycloakAdminFetch(
      `/users/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const error = await getKeycloakError(response, "Failed to delete user");
      return NextResponse.json({ error }, { status: response.status });
    }

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete user",
      },
      { status: 500 },
    );
  }
}
