"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  User,
} from "lucide-react";
import LanguageSelector from "../../i18n/LanguageSelector";
import { useLanguage } from "../../i18n/LanguageProvider";
import { getRoleLabel } from "../../i18n/role-labels";
import { completeLogout } from "../../lib/logout";

export default function Header({ title, collapsed, setCollapsed, profileHref = "/realm" }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { data: session } = useSession();
  const { language, t } = useLanguage();

  const initials = useMemo(() => {
    const name = session?.user?.name || session?.user?.email || t("header.admin");
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "AD"
    );
  }, [session, t]);

  const roleText = useMemo(() => {
    const roles = session?.roles ?? [];
    return roles.map((role) => getRoleLabel(role, language)).join(", ");
  }, [language, session]);

  async function handleLogout() {
    await completeLogout(session);
  }

  return (
    <header className="header">
      <button
        className="header-toggle"
        onClick={() => setCollapsed(!collapsed)}
        type="button"
        aria-label={t("header.toggleSidebar")}
      >
        <Menu size={20} />
      </button>

      <div className="breadcrumb">
        <span>{t("common.appName")}</span>
        <span className="breadcrumb-sep">&gt;</span>
        <span className="breadcrumb-current">{title}</span>
      </div>

      <div className="header-right">
        <div className="header-search">
          <Search size={16} className="search-icon" />
          <input className="search-input" placeholder={t("header.searchPlaceholder")} />
        </div>

        <div className="dropdown-wrap">
          <button
            className="hbtn"
            onClick={() => {
              setNotifOpen(!notifOpen);
              setProfileOpen(false);
            }}
            type="button"
            aria-label={t("header.notifications")}
          >
            <Bell size={18} />
          </button>

          {notifOpen && (
            <div className="dropdown notif-dropdown">
              <div className="notif-header">
                <span className="notif-header-title">{t("header.notifications")}</span>
              </div>
              <div className="notif-item">
                <div className="notif-item-title">{t("header.noNotifications")}</div>
                <div className="notif-item-sub">{t("header.notificationsHint")}</div>
              </div>
            </div>
          )}
        </div>

        <LanguageSelector />

        <div className="dropdown-wrap">
          <button
            className="avatar-btn"
            onClick={() => {
              setProfileOpen(!profileOpen);
              setNotifOpen(false);
            }}
            type="button"
          >
            <div className="avatar">{initials}</div>
            <span className="avatar-name">{session?.user?.name || t("header.admin")}</span>
            <ChevronDown size={16} />
          </button>

          {profileOpen && (
            <div className="dropdown profile-dropdown">
              <div className="dropdown-header">
                <div className="dropdown-user-name">
                  {session?.user?.name || session?.user?.email || t("header.signedInUser")}
                </div>
                <div className="dropdown-user-role">
                  {roleText || t("header.noRealmRoles")}
                </div>
              </div>

              <Link href={profileHref} className="dropdown-item">
                <User size={16} />
                {t("header.profileRealm")}
              </Link>

              <div className="dropdown-divider" />

              <button className="dropdown-item danger" onClick={handleLogout} type="button">
                <LogOut size={16} />
                {t("header.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
