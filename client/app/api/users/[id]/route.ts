import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { normalizeObjectTextFields } from "../../../lib/english-normalizer";
import {
  getKeycloakError,
  syncUserGroups,
  syncUserRealmRoles,
} from "../../../lib/keycloak-users";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const rawBody = await request.json();
    const body = normalizeObjectTextFields(rawBody, [
      "firstName",
      "lastName",
      "username",
      "email",
    ]);
    const { firstName, lastName, username, email, enabled, roles, groups } = body;

    if (!id || !username?.trim()) {
      return NextResponse.json(
        { error: "User ID and username are required" },
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

    const updateRes = await keycloakAdminFetch(
      `/users/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          username: username.trim(),
          email: email?.trim(),
          firstName: firstName?.trim(),
          lastName: lastName?.trim(),
          enabled,
        }),
      },
    );

    if (!updateRes.ok) {
      return NextResponse.json(
        { error: await getKeycloakError(updateRes, "Failed to update user") },
        { status: updateRes.status },
      );
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

export async function DELETE(_request: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

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
      return NextResponse.json(
        { error: await getKeycloakError(response, "Failed to delete user") },
        { status: response.status },
      );
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
