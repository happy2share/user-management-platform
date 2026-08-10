import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch, keycloakAdminFetchAll } from "../../lib/keycloak";
import { normalizeObjectTextFields } from "../../i18n/english-normalizer";

type KeycloakGroup = {
  id: string;
  name?: string;
  path?: string;
  subGroups?: KeycloakGroup[];
};

type KeycloakMember = {
  id: string;
};

type EnrichedGroup = {
  id: string;
  name?: string;
  path?: string;
  directMemberCount: number;
  memberCount: number;
  subGroupCount: number;
  memberIds: string[];
  subGroups: EnrichedGroup[];
};

async function getDirectGroupMembers(groupId: string) {
  return keycloakAdminFetchAll(
    `/groups/${encodeURIComponent(groupId)}/members?briefRepresentation=false`,
  ) as Promise<KeycloakMember[]>;
}

async function getGroupChildren(group: KeycloakGroup, visited: Set<string>) {
  if (visited.has(group.id)) return [];
  visited.add(group.id);

  const children = await keycloakAdminFetchAll(
    `/groups/${encodeURIComponent(group.id)}/children?briefRepresentation=false`,
  ) as KeycloakGroup[];

  return Promise.all(
    children.map((child: KeycloakGroup) => enrichGroup(child, new Set(visited))),
  );
}

async function expandGroupOptions(
  group: KeycloakGroup,
  visited = new Set<string>(),
): Promise<KeycloakGroup> {
  if (visited.has(group.id)) return { ...group, subGroups: [] };
  visited.add(group.id);

  const children = await keycloakAdminFetchAll(
    `/groups/${encodeURIComponent(group.id)}/children?briefRepresentation=false`,
  ) as KeycloakGroup[];

  return {
    ...group,
    subGroups: await Promise.all(
      children.map((child) => expandGroupOptions(child, new Set(visited))),
    ),
  };
}

async function enrichGroup(group: KeycloakGroup, visited = new Set<string>()): Promise<EnrichedGroup> {
  const [directMembers, subGroups] = await Promise.all([
    getDirectGroupMembers(group.id),
    getGroupChildren(group, visited),
  ]);

  const nestedMemberIds = new Set<string>();
  const collect = (candidate: EnrichedGroup) => {
    candidate.memberIds?.forEach((id: string) => nestedMemberIds.add(id));
  };
  subGroups.forEach(collect);
  directMembers.forEach((member) => nestedMemberIds.add(member.id));

  const nestedSubGroupCount = subGroups.reduce(
    (total, child) => total + 1 + (child.subGroupCount || 0),
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

export async function GET(request: Request) {
  const unauthorized = await requireRealmAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const groups = await keycloakAdminFetchAll(
      "/groups?briefRepresentation=false",
    ) as KeycloakGroup[];

    if (new URL(request.url).searchParams.get("options") === "true") {
      return NextResponse.json(
        await Promise.all(groups.map((group) => expandGroupOptions(group))),
      );
    }

    const enrichedGroups = await Promise.all(
      groups.map((group: KeycloakGroup) => enrichGroup(group)),
    );

    return NextResponse.json(enrichedGroups);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch groups" },
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
        { error: await res.text() },
        { status: res.status },
      );
    }

    return NextResponse.json(
      { message: "Group created successfully" },
      { status: 201 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create group" },
      { status: 500 },
    );
  }
}
