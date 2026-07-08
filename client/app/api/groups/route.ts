import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";
import { normalizeObjectTextFields } from "../../lib/english-normalizer";

type KeycloakGroup = {
  id: string;
  name?: string;
  path?: string;
  subGroups?: KeycloakGroup[];
};

type EnrichedGroup = {
  subGroupCount?: number;
  memberIds?: string[];
};

async function readJsonOrEmptyArray(res: Response) {
  if (!res.ok) {
    throw new Error(await getKeycloakError(res, "Failed to load group data"));
  }
  return res.json();
}

async function getDirectGroupMembers(groupId: string) {
  const res = await keycloakAdminFetch(
    `/groups/${encodeURIComponent(groupId)}/members?first=0&max=1000&briefRepresentation=false`,
  );

  return readJsonOrEmptyArray(res);
}

async function getGroupChildren(group: KeycloakGroup, visited: Set<string>) {
  if (visited.has(group.id)) return [];
  visited.add(group.id);

  const childrenRes = await keycloakAdminFetch(
    `/groups/${encodeURIComponent(group.id)}/children?briefRepresentation=false&first=0&max=1000`,
  );

  if (!childrenRes.ok) {
    throw new Error(
      await getKeycloakError(childrenRes, "Failed to load child groups"),
    );
  }
  const children = await childrenRes.json();

  return Promise.all(
    children.map((child: KeycloakGroup) => enrichGroup(child, new Set(visited))),
  );
}

async function enrichGroup(group: KeycloakGroup, visited = new Set<string>()) {
  const [directMembers, subGroups] = await Promise.all([
    getDirectGroupMembers(group.id),
    getGroupChildren(group, visited),
  ]);

  const nestedMemberIds = new Set<string>();
  const collect = (candidate: EnrichedGroup) => {
    candidate.memberIds?.forEach((id: string) => nestedMemberIds.add(id));
  };
  subGroups.forEach(collect);
  directMembers.forEach((member: { id: string }) => nestedMemberIds.add(member.id));

  const nestedSubGroupCount = subGroups.reduce(
    (total: number, child: EnrichedGroup) => total + 1 + (child.subGroupCount || 0),
    0,
  );

  return {
    id: group.id,
    name: group.name,
    path: group.path,
    directMemberCount: directMembers.length,
    memberCount: nestedMemberIds.size,
    subGroupCount: nestedSubGroupCount,
    memberIds: [...nestedMemberIds],
    subGroups,
  };
}

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const res = await keycloakAdminFetch("/groups?briefRepresentation=false&first=0&max=1000");

    if (!res.ok) {
      return NextResponse.json(
        { error: await getKeycloakError(res, "Failed to fetch groups") },
        { status: res.status },
      );
    }

    const groups = await res.json();

    const enrichedGroups = await Promise.all(
      groups.map((group: KeycloakGroup) => enrichGroup(group)),
    );

    return NextResponse.json(enrichedGroups);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: await getKeycloakError(err, "Failed to fetch groups") },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = normalizeObjectTextFields(await req.json(), ["name"]);

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Group name is required" },
        { status: 400 },
      );
    }

    const path = body.parentId
      ? `/groups/${encodeURIComponent(body.parentId)}/children`
      : "/groups";

    const res = await keycloakAdminFetch(path, {
      method: "POST",
      body: JSON.stringify({ name: body.name.trim() }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: await getKeycloakError(res, "Failed to create group") },
        { status: res.status },
      );
    }

    return NextResponse.json(
      { message: "Group created successfully" },
      { status: 201 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: await getKeycloakError(err, "Failed to create group") },
      { status: 500 },
    );
  }
}
