import { getServerSession } from "next-auth";
import { ApiNextResponse as NextResponse } from "./api-response";
import { authOptions } from "./auth";

type AuthorizedSession = {
  roles?: string[];
};

const authorizedSessions = new WeakMap<Request, AuthorizedSession>();

export function authorizedSessionFor(request: Request) {
  return authorizedSessions.get(request);
}

export async function requireRealmAdmin(request?: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const roles = (session as typeof session & AuthorizedSession).roles ?? [];

  if (!roles.includes("realm-admin")) {
    return NextResponse.json(
      { error: "Realm administrator access is required" },
      { status: 403 },
    );
  }

  if (request) authorizedSessions.set(request, session as AuthorizedSession);
  return null;
}
