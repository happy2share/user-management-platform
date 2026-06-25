"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Shield,
  FolderTree,
  Activity,
  Globe,
  Boxes,
  Lock,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageProvider";

export default function Sidebar({ collapsed }) {
  const pathname = usePathname();
  const { t } = useLanguage();

  const menu = [
    {
      title: t("nav.portal"),
      items: [
        { label: t("nav.dashboard"), href: "/dashboard", icon: LayoutDashboard },
        { label: t("nav.realm"), href: "/realm", icon: Globe },
        { label: t("nav.clients"), href: "/clients", icon: Boxes },
        { label: t("nav.authentication"), href: "/authentication", icon: Lock },
      ],
    },
    {
      title: t("nav.identity"),
      items: [
        { label: t("nav.users"), href: "/users", icon: Users },
        { label: t("nav.roles"), href: "/roles", icon: Shield },
        { label: t("nav.groups"), href: "/groups", icon: FolderTree },
        { label: t("nav.sessions"), href: "/sessions", icon: Activity },
      ],
    },
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div className="brand-icon"></div>
        {!collapsed && <span className="brand-name">{t("common.appName")}</span>}
      </div>

      <div className="sidebar-nav">
        {menu.map((section) => (
          <div key={section.title}>
            {!collapsed && <div className="nav-section">{section.title}</div>}

            {section.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                >
                  <span className="nav-icon">
                    <Icon size={18} strokeWidth={1.8} />
                  </span>

                  {!collapsed && (
                    <span className="nav-label">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
