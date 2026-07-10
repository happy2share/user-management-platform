import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../../lib/api-auth";
import { keycloakAdminFetchAll } from "../../../../lib/keycloak";

type RouteContext = { params: Promise<{ id: string }> };

type KeycloakGroupChild = {
  id: string;
};

type KeycloakMember = {
  id?: string;
  username?: string;
  email?: string;
};

async function readMembers(groupId: string) {
  return keycloakAdminFetchAll(
    `/groups/${encodeURIComponent(groupId)}/members?briefRepresentation=false`,
  ) as Promise<KeycloakMember[]>;
}

async function readChildren(groupId: string) {
  return keycloakAdminFetchAll(
    `/groups/${encodeURIComponent(groupId)}/children?briefRepresentation=false`,
  ) as Promise<KeycloakGroupChild[]>;
}

async function collectMembers(groupId: string, visited = new Set<string>()) {
  if (visited.has(groupId)) return [];
  visited.add(groupId);

  const [members, children] = await Promise.all([
    readMembers(groupId),
    readChildren(groupId),
  ]);

  const nestedMembers = await Promise.all(
    children.map((child) => collectMembers(child.id, new Set(visited))),
  );

  const byId = new Map<string, KeycloakMember>();
  [...members, ...nestedMembers.flat()].forEach((member) => {
    if (member?.id) byId.set(member.id, member);
  });

  return [...byId.values()];
}

export async function GET(
  _req: Request,
  context: RouteContext,
) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const [directMembers, allMembers] = await Promise.all([
      readMembers(id),
      collectMembers(id),
    ]);

    return NextResponse.json({
      directMembers,
      members: allMembers,
      directCount: directMembers.length,
      totalCount: allMembers.length,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch group members" },
      { status: 500 },
    );
  }
}
