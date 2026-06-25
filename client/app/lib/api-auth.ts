import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";

type AuthorizedSession = {
  roles?: string[];
};

export async function requireRealmAdmin() {
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

  return null;
}
