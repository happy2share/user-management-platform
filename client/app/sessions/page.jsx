"use client";

import { useEffect, useState } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import styles from "./sessions.module.css";

function formatTime(value, fallback) {
  if (!value) return fallback;
  return new Date(value).toLocaleString();
}

export default function SessionsPage() {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");

  async function loadSessions() {
    setError("");
    const res = await fetch("/api/sessions", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setError(data.error || t("sessions.failedLoad"));
    setSessions(data);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadSessions();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revoke(session) {
    if (!confirm(t("sessions.revokeConfirm", { username: session.username }))) return;
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(session.id)}?userId=${encodeURIComponent(session.userId)}`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || t("sessions.failedRevoke"));
    loadSessions();
  }

  async function revokeAll() {
    if (!confirm(t("sessions.revokeAllConfirm"))) return;
    const res = await fetch("/api/sessions", { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || t("sessions.failedRevokeAll"));
    loadSessions();
  }

  return (
    <AdminLayout title={t("sessions.title")}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t("sessions.title")}</h1>
          <p className="page-subtitle">
            {t("sessions.subtitle", {
              count: sessions.length,
              plural: sessions.length !== 1 ? "s" : "",
            })}
          </p>
        </div>
        <button className="btn btn-danger" onClick={revokeAll}>
          {t("sessions.revokeAll")}
        </button>
      </div>
      {error && (
        <div className="card" style={{ color: "#b91c1c" }}>
          {error}
        </div>
      )}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("users.user")}</th>
                <th>{t("sessions.ipAddress")}</th>
                <th>{t("sessions.clients")}</th>
                <th>{t("sessions.started")}</th>
                <th>{t("sessions.lastAccess")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>{t("sessions.noSessions")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id}>
                    <td style={{ fontWeight: 500 }}>
                      {session.username}
                      <div className="text-muted text-sm">{session.email || t("common.dash")}</div>
                    </td>
                    <td>
                      <code className={styles.ip}>{session.ipAddress || t("common.dash")}</code>
                    </td>
                    <td>
                      {Object.keys(session.clients || {}).map((clientId) => (
                        <span
                          className="badge badge-blue"
                          key={clientId}
                          style={{ marginRight: 4 }}
                        >
                          {clientId}
                        </span>
                      ))}
                    </td>
                    <td className="text-muted text-sm">
                      {formatTime(session.start, t("common.dash"))}
                    </td>
                    <td className="text-muted text-sm">
                      {formatTime(session.lastAccess, t("common.dash"))}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => revoke(session)}
                      >
                        {t("sessions.revoke")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
