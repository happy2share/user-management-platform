"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Activity,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  ShieldCheck,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import Header from "../layout/Header";
import Sidebar from "../layout/Sidebar";
import {
  STAFF_PORTALS,
  STAFF_ROLE_ORDER,
  canAccessStaffPortal,
  staffPortalTarget,
} from "../../lib/staff-portals";
import "../layout/AdminLayout.css";
import "../layout/Sidebar.css";
import "../layout/Header.css";
import "../layout/Common.css";
import "../layout/Tables.css";
import "./staff-portal.css";

const ROLE_ICONS = {
  owner: LayoutDashboard,
  "service-manager": UserCog,
  "senior-technician": ShieldCheck,
  technician: Wrench,
  "helper-apprentice": GraduationCap,
};

function staffMenuForRoles(roles) {
  if (roles.includes("realm-admin") || roles.includes("owner")) {
    return [
      {
        title: "Owner Control",
        items: [
          { label: "Admin Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { label: STAFF_PORTALS.owner.label, href: STAFF_PORTALS.owner.path, icon: ROLE_ICONS.owner },
        ],
      },
      {
        title: "Staff Portals",
        items: STAFF_ROLE_ORDER.slice(1).map((role) => ({
          label: STAFF_PORTALS[role].label,
          href: STAFF_PORTALS[role].path,
          icon: ROLE_ICONS[role],
        })),
      },
    ];
  }

  const highestIndex = STAFF_ROLE_ORDER.findIndex((role) => roles.includes(role));
  const allowedRoles = highestIndex >= 0 ? STAFF_ROLE_ORDER.slice(highestIndex) : [];

  return [
    {
      title: "Workshop Portal",
      items: allowedRoles.map((allowedRole) => ({
        label: STAFF_PORTALS[allowedRole].label,
        href: STAFF_PORTALS[allowedRole].path,
        icon: ROLE_ICONS[allowedRole],
      })),
    },
  ];
}

export default function StaffPortal({ role }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const roles = useMemo(() => session?.roles ?? [], [session]);
  const portal = STAFF_PORTALS[role];
  const allowed = canAccessStaffPortal(roles, role);
  const menu = useMemo(() => staffMenuForRoles(roles), [roles]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status === "authenticated" && !allowed) {
      router.replace(staffPortalTarget(roles));
    }
  }, [allowed, roles, router, status]);

  if (status === "loading") {
    return <main className="staff-loading">Loading portal...</main>;
  }

  if (!allowed) {
    return <main className="staff-loading">Redirecting...</main>;
  }

  return (
    <div className="app">
      <Sidebar collapsed={collapsed} menu={menu} />

      <div className={`main ${collapsed ? "expanded" : ""}`}>
        <Header
          title={portal.title}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          profileHref={portal.path}
        />

        <main className="page">
        <div className="page-header staff-dashboard-header">
          <div>
            <div className="page-title">{portal.title}</div>
            <div className="page-subtitle">{portal.intro}</div>
          </div>
        </div>

        <div className="stats-grid">
          {portal.stats.map(([label, value], index) => {
            const icons = [ShieldCheck, Users, ClipboardCheck, Activity];
            const colors = ["blue", "green", "amber", "purple"];
            const Icon = icons[index] || Activity;

            return (
              <div className="stat-card" key={label}>
                <div className={`stat-icon ${colors[index] || "blue"}`}>
                  <Icon size={22} />
                </div>
                <div className="stat-body">
                  <div className="stat-label">{label}</div>
                  <div className="stat-value staff-stat-value">{value}</div>
                  <div className="stat-change">{portal.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Role Scope</div>
                <div className="card-subtitle">Permissions for this portal level</div>
              </div>
            </div>

            {portal.cards.map(([title, text]) => (
              <div className="dashboard-info-row" key={title}>
                <span>{title}</span>
                <strong>{text}</strong>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Work Area</div>
                <div className="card-subtitle">Expected actions for this role</div>
              </div>
            </div>

            {portal.actions.map((action) => (
              <div className="dashboard-user-row" key={action}>
                <div>
                  <strong>{action}</strong>
                  <p>{session?.user?.name || "Current user"} - {portal.label}</p>
                </div>
                <span className="badge badge-blue">Available</span>
              </div>
            ))}

            <div className="staff-permission-note">
              These actions are shown from your Keycloak role hierarchy.
            </div>
          </div>
        </div>
        </main>
      </div>
    </div>
  );
}
