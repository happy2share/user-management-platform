import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

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

type KeycloakRole = {
  id?: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
  attributes?: Record<string, string[]>;
};

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const res = await keycloakAdminFetch("/roles?max=1000");
    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to fetch roles");
      return NextResponse.json({ error }, { status: res.status });
    }
    const roles = (await res.json()) as KeycloakRole[];

    const enrichedRoles = roles.map((role) => ({
      ...role,
      composite: role.composite === true,
      description: cleanDescription(role.description),
    }));

    return NextResponse.json(enrichedRoles);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch roles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    if (
      typeof body.name !== "string" ||
      (body.description !== undefined && typeof body.description !== "string")
    ) {
      return NextResponse.json({ error: "Role name and description must be strings" }, { status: 400 });
    }
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Role name is required" }, { status: 400 });

    const res = await keycloakAdminFetch("/roles", {
      method: "POST",
      body: JSON.stringify({ name, description: body.description?.trim() || "" }),
    });

    if (!res.ok) {

      const error = await getKeycloakError(res, "Failed to create role");

      return NextResponse.json({ error }, { status: res.status });

    }
    return NextResponse.json({ message: "Role created successfully" }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create role" }, { status: 500 });
  }
}
