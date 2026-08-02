import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./lib/auth";
import LandingAuth from "./components/auth/LandingAuth";
import { roleTarget } from "./lib/role-target";

type SessionWithRoles = {
  needsUsername?: boolean;
  roles?: string[];
};

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    const typedSession = session as typeof session & SessionWithRoles;
    if (typedSession.needsUsername) redirect("/choose-username");
    const roles = typedSession.roles ?? [];
    redirect(roleTarget(roles));
  }

  return <LandingAuth />;
}
