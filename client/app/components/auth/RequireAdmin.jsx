"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { completeLogout } from "../../lib/logout";
import { useSession } from "next-auth/react";
import { isAdminRole } from "../../lib/role-target";

export default function RequireAdmin({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const roles = useMemo(() => session?.roles ?? [], [session]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  async function handleLogout() {
    await completeLogout(session);
  }

  useEffect(() => {
    if (status === "authenticated" && session?.needsUsername) {
      router.replace("/choose-username");
    } else if (status === "authenticated" && !isAdminRole(roles)) {
      router.replace("/user-portal");
    }
  }, [router, roles, session?.needsUsername, status]);


  if (status === "loading") {
    return (
      <div className="page">
        <div className="card">Checking access...</div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="page">
        <div className="card">Redirecting to login...</div>
      </div>
    );
  }

  if (!isAdminRole(roles)) {
    return (
      <div className="page">
        <div className="card">
          <h2>Access denied</h2>
          <p className="text-muted">
            Only users with the realm-admin role can access this admin area.
          </p>

          <button className="btn btn-primary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return children;
}
