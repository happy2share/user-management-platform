"use client";

import { useEffect, useState } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import { Users, FolderTree, Activity, Globe } from "lucide-react";
import "./dashboard.css";

export default function DashboardPage() {
  const { t } = useLanguage();
  const [data, setData] = useState({
    users: [],
    groups: [],
    sessions: [],
    realm: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const [usersRes, groupsRes, sessionsRes, realmRes] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/groups", { cache: "no-store" }),
        fetch("/api/sessions", { cache: "no-store" }),
        fetch("/api/realms", { cache: "no-store" }),
      ]);

      if (!usersRes.ok) throw new Error(t("dashboard.failedUsers"));
      if (!groupsRes.ok) throw new Error(t("dashboard.failedGroups"));
      if (!sessionsRes.ok) throw new Error(t("dashboard.failedSessions"));
      if (!realmRes.ok) throw new Error(t("dashboard.failedRealm"));

      const [users, groups, sessions, realm] = await Promise.all([
        usersRes.json(),
        groupsRes.json(),
        sessionsRes.json(),
        realmRes.json(),
      ]);

      setData({
        users: Array.isArray(users) ? users : [],
        groups: Array.isArray(groups) ? groups : [],
        sessions: Array.isArray(sessions) ? sessions : [],
        realm,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.failedDashboard"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadDashboard();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enabledUsers = data.users.filter((u) => u.enabled !== false).length;
  const disabledUsers = data.users.filter((u) => u.enabled === false).length;

  return (
    <AdminLayout title={t("dashboard.title")}>
      <div className="page-header dashboard-header">
        <div>
          <div className="page-title">{t("dashboard.title")}</div>
          <div className="page-subtitle">{t("dashboard.subtitle")}</div>
        </div>

        <button className="btn btn-outline" onClick={loadDashboard}>
          {t("common.refresh")}
        </button>
      </div>

      {loading && <div className="card">{t("dashboard.loading")}</div>}

      {error && <div className="card dashboard-error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">
                <Users size={22} />
              </div>
              <div className="stat-body">
                <div className="stat-label">{t("dashboard.totalUsers")}</div>
                <div className="stat-value">{data.users.length}</div>
                <div className="stat-change">
                  {t("dashboard.enabledDisabled", { enabled: enabledUsers, disabled: disabledUsers })}
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <Activity size={22} />
              </div>
              <div className="stat-body">
                <div className="stat-label">{t("dashboard.activeSessions")}</div>
                <div className="stat-value">{data.sessions.length}</div>
                <div className="stat-change">{t("dashboard.fetchedFromKeycloak")}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon amber">
                <FolderTree size={22} />
              </div>
              <div className="stat-body">
                <div className="stat-label">{t("dashboard.groups")}</div>
                <div className="stat-value">{data.groups.length}</div>
                <div className="stat-change">{t("dashboard.realmGroups")}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon purple">
                <Globe size={22} />
              </div>
              <div className="stat-body">
                <div className="stat-label">{t("dashboard.realm")}</div>
                <div className="stat-value">
                  {data.realm?.enabled ? t("common.enabled") : t("common.disabled")}
                </div>
                <div className="stat-change">
                  {data.realm?.realm || t("common.unknown")}
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">{t("dashboard.realmDetails")}</div>
                  <div className="card-subtitle">
                    {t("dashboard.realmDetailsSubtitle")}
                  </div>
                </div>
              </div>

              <div className="dashboard-info-row">
                <span>{t("dashboard.realm")}</span>
                <strong>{data.realm?.realm || t("common.dash")}</strong>
              </div>

              <div className="dashboard-info-row">
                <span>{t("dashboard.displayName")}</span>
                <strong>{data.realm?.displayName || t("common.dash")}</strong>
              </div>

              <div className="dashboard-info-row">
                <span>{t("dashboard.sslRequired")}</span>
                <strong>{data.realm?.sslRequired || t("common.dash")}</strong>
              </div>

              <div className="dashboard-info-row">
                <span>{t("dashboard.registration")}</span>
                <strong>
                  {data.realm?.registrationAllowed ? t("dashboard.allowed") : t("common.disabled")}
                </strong>
              </div>

              <div className="dashboard-info-row">
                <span>{t("dashboard.bruteForceProtection")}</span>
                <strong>
                  {data.realm?.bruteForceProtected ? t("common.enabled") : t("common.disabled")}
                </strong>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">{t("dashboard.recentUsers")}</div>
                  <div className="card-subtitle">
                    {t("dashboard.recentUsersSubtitle")}
                  </div>
                </div>
              </div>

              {data.users.slice(0, 5).map((user) => (
                <div className="dashboard-user-row" key={user.id}>
                  <div>
                    <strong>{user.username}</strong>
                    <p>{user.email || t("common.noEmail")}</p>
                  </div>

                  <span
                    className={
                      user.enabled
                        ? "badge badge-success"
                        : "badge badge-danger"
                    }
                  >
                    {user.enabled ? t("common.enabled") : t("common.disabled")}
                  </span>
                </div>
              ))}

              {data.users.length === 0 && <p>{t("dashboard.noUsersFound")}</p>}
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
