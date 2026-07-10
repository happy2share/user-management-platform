"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLanguage } from "../i18n/LanguageProvider";
import { getRoleLabel } from "../i18n/role-labels";
import { completeLogout } from "../lib/logout";
import { roleTarget } from "../lib/role-target";

export default function UserPortalPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { language, t } = useLanguage();
  const roles = useMemo(() => session?.roles ?? [], [session]);
  const roleLabels = useMemo(
    () => roles.map((role) => getRoleLabel(role, language)).join(", "),
    [language, roles],
  );

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status === "authenticated") {
      if (session?.needsUsername) {
        router.replace("/choose-username");
        return;
      }
      const target = roleTarget(roles);
      if (target !== "/user-portal") router.replace(target);
    }
  }, [router, roles, session?.needsUsername, status]);

  if (status === "loading") {
    return <main style={{ padding: 32 }}>{t("common.loading")}</main>;
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: 32 }}>
      <section
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 28,
        }}
      >
        <h1 style={{ marginTop: 0 }}>{t("userPortal.title")}</h1>
        <p style={{ color: "#64748b" }}>
          {t("userPortal.message")}
        </p>
        <div
          style={{
            marginTop: 24,
            padding: 18,
            background: "#f1f5f9",
            borderRadius: 14,
          }}
        >
          <p>
            <b>{t("common.name")}:</b> {session?.user?.name ?? t("common.dash")}
          </p>
          <p>
            <b>{t("common.email")}:</b> {session?.user?.email ?? t("common.dash")}
          </p>
          <p>
            <b>{t("userPortal.roles")}</b>{" "}
            {roleLabels || t("userPortal.noRoles")}
          </p>
        </div>
        <button
          onClick={() => completeLogout(session)}
          style={{
            marginTop: 24,
            padding: "10px 16px",
            borderRadius: 10,
            border: 0,
            background: "#111827",
            color: "white",
            cursor: "pointer",
          }}
        >
          {t("header.logout")}
        </button>
      </section>
    </main>
  );
}
