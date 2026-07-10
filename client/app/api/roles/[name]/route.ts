import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { getKeycloakError } from "../../../lib/keycloak-users";

type RouteContext = { params: Promise<{ name: string }> };
type RoleAttributes = Record<string, string[]>;
type KeycloakRole = {
  id?: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
  attributes?: RoleAttributes;
};

function cleanDescription(description?: string) {
  if (!description) return "";
  const match = description.match(/^\$\{([^}]+)\}$/);
  if (match?.[1]) {
    return match[1]
      .replace(/^(role|client)_/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return description;
}

function normalizeAttributes(attributes: unknown): RoleAttributes {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(attributes as Record<string, unknown>).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(String) : [String(value ?? "")],
    ]),
  );
}

export async function GET(_req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const res = await keycloakAdminFetch(`/roles/${encodeURIComponent(name)}`);
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to fetch role");
      return NextResponse.json({ error }, { status: res.status });
    }
    const role = (await res.json()) as KeycloakRole;
    return NextResponse.json({
      ...role,
      composite: role.composite === true,
      rawDescription: role.description || "",
      description: cleanDescription(role.description),
      attributes: normalizeAttributes(role.attributes),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch role" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const currentRes = await keycloakAdminFetch(`/roles/${encodeURIComponent(name)}`);
    if (!currentRes.ok) {
      const error = await getKeycloakError(currentRes, "Failed to fetch role");
      return NextResponse.json({ error }, { status: currentRes.status });
    }
    const current = (await currentRes.json()) as KeycloakRole;
    const body = await req.json();
    if (
      (body.name !== undefined && typeof body.name !== "string") ||
      (body.description !== undefined && typeof body.description !== "string")
    ) {
      return NextResponse.json({ error: "Role name and description must be strings" }, { status: 400 });
    }
    const nextName = body.name?.trim() || name;

    const res = await keycloakAdminFetch(`/roles/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify({
        ...current,
        name: nextName,
        description: body.description === undefined ? current.description : body.description.trim(),
        attributes: normalizeAttributes(body.attributes ?? current.attributes),
      }),
    });

    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to update role");
      return NextResponse.json({ error }, { status: res.status });

    }
    return NextResponse.json({ message: "Role updated successfully", name: nextName });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update role" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { name } = await context.params;
    const res = await keycloakAdminFetch(`/roles/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to delete role");
      return NextResponse.json({ error }, { status: res.status });
    }
    return NextResponse.json({ message: "Role deleted successfully" });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete role" },
      { status: 500 },
    );
  }
}
