import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../../../lib/api-auth";
import { keycloakAdminFetch } from "../../../../lib/keycloak";
import { getKeycloakError } from "../../../../lib/keycloak-users";

type RouteContext = { params: Promise<{ id: string }> };

async function readMembers(groupId: string) {
  const res = await keycloakAdminFetch(
    `/groups/${encodeURIComponent(groupId)}/members?first=0&max=1000&briefRepresentation=false`,
  );

  if (!res.ok) {
    throw new Error(await getKeycloakError(res, "Failed to load group members"));
  }
  return res.json();
}

async function readChildren(groupId: string) {
  const res = await keycloakAdminFetch(
    `/groups/${encodeURIComponent(groupId)}/children?briefRepresentation=false&first=0&max=1000`,
  );

  if (!res.ok) {
    throw new Error(await getKeycloakError(res, "Failed to load child groups"));
  }
  return res.json();
}

async function collectMembers(groupId: string, visited = new Set<string>()) {
  if (visited.has(groupId)) return [];
  visited.add(groupId);

  const [members, children] = await Promise.all([
    readMembers(groupId),
    readChildren(groupId),
  ]);

  const nestedMembers = await Promise.all(
    children.map((child: { id: string }) => collectMembers(child.id, new Set(visited))),
  );

  const byId = new Map<string, any>();
  [...members, ...nestedMembers.flat()].forEach((member: any) => {
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch group members" },
      { status: 500 },
    );
  }
}
