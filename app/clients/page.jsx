"use client";

import { useEffect, useState } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import styles from "./clients.module.css";

export default function ClientsPage() {
  const { t } = useLanguage();
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");

  async function loadClients() {
    setError("");
    const res = await fetch("/api/clients", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setError(data.error || t("clients.failedLoad"));
    setClients(data);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadClients();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminLayout title={t("clients.title")}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t("clients.title")}</h1>
          <p className="page-subtitle">{t("clients.subtitle")}</p>
        </div>
        <button className="btn btn-outline" onClick={loadClients}>
          {t("common.refresh")}
        </button>
      </div>

      {error && <div className="card" style={{ color: "#b91c1c" }}>{error}</div>}

      <div className={styles.clientsGrid}>
        {clients.map((client) => (
          <div className="card" key={client.id}>
            <div className={styles.clientCard}>
              <div>
                <div className={styles.clientTitle}>
                  {client.clientId}
                  <span className={`badge ${client.enabled ? "badge-success" : "badge-danger"}`} style={{ marginLeft: 10 }}>
                    {client.enabled ? t("clients.active") : t("clients.disabled")}
                  </span>
                  <span className={`badge ${!client.publicClient ? "badge-purple" : "badge-gray"}`} style={{ marginLeft: 6 }}>
                    {client.publicClient ? t("clients.public") : t("clients.confidential")}
                  </span>
                </div>
                <p className={styles.clientPurpose}>
                  {client.name || (client.serviceAccountsEnabled ? t("clients.serviceAccountClient") : t("clients.applicationLoginClient"))}
                </p>
                <div className={styles.clientMeta}>
                  <span className="text-muted text-sm">{t("clients.protocol")} </span>
                  <code className={styles.code}>{client.protocol || t("common.dash")}</code>
                  <span className="text-muted text-sm" style={{ marginLeft: 16 }}>{t("clients.standardFlow")} </span>
                  <code className={styles.code}>{String(!!client.standardFlowEnabled)}</code>
                  <span className="text-muted text-sm" style={{ marginLeft: 16 }}>{t("clients.serviceAccount")} </span>
                  <code className={styles.code}>{String(!!client.serviceAccountsEnabled)}</code>
                </div>
                {client.redirectUris?.length > 0 && (
                  <p className={styles.clientNote}>
                    {t("clients.redirectUris", { uris: client.redirectUris.join(", ") })}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
