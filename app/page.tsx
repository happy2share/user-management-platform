import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./lib/auth";
import LandingAuth from "./components/auth/LandingAuth";
import { roleTarget } from "./lib/role-target";

type SessionWithRoles = {
  roles?: string[];
};

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    const roles = (session as typeof session & SessionWithRoles).roles ?? [];
    redirect(roleTarget(roles));
  }

  return <LandingAuth />;
}
