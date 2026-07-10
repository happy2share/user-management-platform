"use client";

import { ExternalLink, MoreVertical, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useEffect } from "react";
import Modal from "../components/common/Modal";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import { cleanDisplayText, humanizeKey } from "../lib/display-text";
import { readApiResponse } from "../lib/api-response";
import styles from "./clients.module.css";

const DEFAULT_FORM = {
  clientId: "",
  name: "",
  description: "",
  rootUrl: "",
  baseUrl: "",
  publicClient: true,
  standardFlowEnabled: true,
  directAccessGrantsEnabled: false,
  serviceAccountsEnabled: false,
};

export default function ClientsPage() {
  const { t } = useLanguage();
  const fileInputRef = useRef(null);
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  async function loadClients() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/clients", { cache: "no-store" });
    const data = await readApiResponse(res);
    if (!res.ok) setError(data.error || t("clients.failedLoad"));
    else setClients(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadClients();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredClients = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return clients;
    return clients.filter((client) =>
      `${client.clientId || ""} ${client.name || ""} ${client.description || ""}`
        .toLowerCase()
        .includes(search),
    );
  }, [clients, query]);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setForm(DEFAULT_FORM);
    setModal("create");
  }

  async function saveClient() {
    setSaving(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        redirectUris: form.rootUrl ? [`${form.rootUrl.replace(/\/$/, "")}/*`] : [],
      }),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      setError(data.error || "Failed to create client");
    } else {
      setMessage("Client created successfully.");
      setModal(null);
      await loadClients();
    }
    setSaving(false);
  }

  async function importClient(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      setSaving(true);
      setError("");
      setMessage("");
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readApiResponse(res);
      if (!res.ok) setError(data.error || "Failed to import client");
      else {
        setMessage("Client imported successfully.");
        await loadClients();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read client file");
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient(client) {
    if (!confirm(`Delete client "${client.clientId}"?`)) return;
    setError("");
    setMessage("");
    const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, { method: "DELETE" });
    const data = await readApiResponse(res);
    if (!res.ok) setError(data.error || "Failed to delete client");
    else {
      setMessage("Client deleted successfully.");
      await loadClients();
    }
  }

  return (
    <AdminLayout title={t("clients.title")}>
      <section className={styles.clientsPage}>
        <header className={styles.header}>
          <div>
            <h1>{t("clients.title")}</h1>
            <p>
              Clients are applications and services that can request authentication of a user.
              <a href="https://www.keycloak.org/docs/latest/server_admin/#assembly-managing-clients_server_administration_guide" target="_blank" rel="noreferrer">
                Learn more <ExternalLink size={12} />
              </a>
            </p>
          </div>
        </header>

        <div className={styles.tabs}>
          <button className={styles.activeTab} type="button">Clients list</button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for client" />
          </div>
          <button className="btn btn-primary" type="button" onClick={openCreate}>Create client</button>
          <button className="btn btn-outline" type="button" onClick={() => fileInputRef.current?.click()} disabled={saving}>Import client</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={importClient} />
          <button className="btn btn-outline" type="button" onClick={loadClients} disabled={loading}>
            <RefreshCw size={14} />
            Refresh
          </button>
          <span className={styles.range}>{filteredClients.length ? `1 - ${filteredClients.length}` : "0"}</span>
        </div>

        {error && <div className={styles.alertError}>{error}</div>}
        {message && <div className={styles.alertSuccess}>{message}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.clientsTable}>
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
                <th>Home URL</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className={styles.empty}>Loading clients...</td></tr>
              ) : filteredClients.length === 0 ? (
                <tr><td colSpan={6} className={styles.empty}>No clients found</td></tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <Link className={styles.clientLink} href={`/clients/${encodeURIComponent(client.id)}`}>
                        {client.clientId}
                      </Link>
                    </td>
                    <td>{cleanDisplayText(client.name, humanizeKey(client.clientId))}</td>
                    <td>{client.protocol === "openid-connect" ? "OpenID Connect" : client.protocol || "-"}</td>
                    <td>{cleanDisplayText(client.description)}</td>
                    <td>
                      {client.baseUrl || client.rootUrl || client.redirectUris?.[0] ? (
                        <a className={styles.homeLink} href={client.baseUrl || client.rootUrl || client.redirectUris[0]} target="_blank" rel="noreferrer">
                          {client.baseUrl || client.rootUrl || client.redirectUris[0]}
                          <ExternalLink size={13} />
                        </a>
                      ) : "-"}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <Link className={styles.moreButton} href={`/clients/${encodeURIComponent(client.id)}`} aria-label={`View ${client.clientId}`}>
                          <MoreVertical size={16} />
                        </Link>
                        <button className={styles.deleteButton} type="button" onClick={() => deleteClient(client)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modal === "create" && (
        <Modal
          title="Create client"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-outline" type="button" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={saveClient} disabled={saving || !form.clientId.trim()}>
                {saving ? "Creating..." : "Create client"}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Client ID</label>
            <input className="form-input" value={form.clientId} onChange={(event) => updateForm("clientId", event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Root URL</label>
              <input className="form-input" value={form.rootUrl} onChange={(event) => updateForm("rootUrl", event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Home URL</label>
              <input className="form-input" value={form.baseUrl} onChange={(event) => updateForm("baseUrl", event.target.value)} />
            </div>
          </div>
          <label className={styles.checkLine}>
            <input type="checkbox" checked={form.publicClient} onChange={(event) => updateForm("publicClient", event.target.checked)} />
            Public client
          </label>
          <label className={styles.checkLine}>
            <input type="checkbox" checked={form.standardFlowEnabled} onChange={(event) => updateForm("standardFlowEnabled", event.target.checked)} />
            Standard flow
          </label>
          <label className={styles.checkLine}>
            <input type="checkbox" checked={form.directAccessGrantsEnabled} onChange={(event) => updateForm("directAccessGrantsEnabled", event.target.checked)} />
            Direct access grants
          </label>
          <label className={styles.checkLine}>
            <input type="checkbox" checked={form.serviceAccountsEnabled} onChange={(event) => updateForm("serviceAccountsEnabled", event.target.checked)} />
            Service accounts
          </label>
        </Modal>
      )}
    </AdminLayout>
  );
}
