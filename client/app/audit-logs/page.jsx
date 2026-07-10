"use client";

import { useEffect, useState } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import { readApiResponse } from "../lib/api-response";

export default function AuditLogsPage() {
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  async function loadLogs() {
    setError("");
    const response = await fetch("/api/audit-logs?max=200", {
      cache: "no-store",
    });
    const data = await readApiResponse(response);
    if (!response.ok) return setError(data.error || t("auditLogs.failedLoad"));
    setLogs(data);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(loadLogs, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminLayout title={t("auditLogs.title")}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t("auditLogs.title")}</h1>
          <p className="page-subtitle">
            {t("auditLogs.subtitle", { count: logs.length })}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadLogs}>
          {t("common.refresh")}
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
                <th>{t("auditLogs.time")}</th>
                <th>{t("auditLogs.category")}</th>
                <th>{t("auditLogs.action")}</th>
                <th>{t("auditLogs.message")}</th>
                <th>{t("common.status")}</th>
                <th>{t("auditLogs.actor")}</th>
                <th>{t("auditLogs.account")}</th>
                <th>{t("auditLogs.resource")}</th>
                <th>{t("sessions.ipAddress")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <p>{error ? t("auditLogs.enableHint") : t("auditLogs.noLogs")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-muted text-sm">
                      {new Date(log.time).toLocaleString()}
                    </td>
                    <td>{log.category}</td>
                    <td>
                      <code>{log.action}</code>
                      {log.error && (
                        <div className="text-muted text-sm">{log.error}</div>
                      )}
                    </td>
                    <td>{log.message}</td>
                    <td>
                      <span
                        className={`badge ${
                          log.status === "Success" ? "badge-green" : "badge-red"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td>{log.actor}</td>
                    <td>{log.account}</td>
                    <td>{log.resource}</td>
                    <td>
                      <code>{log.ipAddress}</code>
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
