"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import Modal from "../../components/common/Modal";
import AdminLayout from "../../components/layout/AdminLayout";
import { cleanDisplayText } from "../../lib/display-text";
import { readApiResponse } from "../../lib/api-response";
import styles from "../clients.module.css";
import detailStyles from "./client-detail.module.css";

const TABS = ["Settings", "Roles"];
const DEFAULT_ROLE = { name: "", description: "" };

export default function ClientDetailPage({ params }) {
  const { id } = use(params);
  const [client, setClient] = useState(null);
  const [draft, setDraft] = useState(null);
  const [roles, setRoles] = useState([]);
  const [roleForm, setRoleForm] = useState(DEFAULT_ROLE);
  const [activeTab, setActiveTab] = useState("Settings");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [roleQuery, setRoleQuery] = useState("");

  async function loadClient() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await readApiResponse(res);
    if (!res.ok) {
      setError(data.error || "Failed to load client");
    } else {
      setClient(data);
      setDraft(data);
    }
    setLoading(false);
  }

  async function loadRoles() {
    setError("");
    const res = await fetch(`/api/clients/${encodeURIComponent(id)}/roles`, { cache: "no-store" });
    const data = await readApiResponse(res);
    if (!res.ok) setError(data.error || "Failed to load client roles");
    else setRoles(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadClient();
      loadRoles();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filteredRoles = useMemo(() => {
    const search = roleQuery.trim().toLowerCase();
    if (!search) return roles;
    return roles.filter((role) => `${role.name || ""} ${role.description || ""}`.toLowerCase().includes(search));
  }, [roleQuery, roles]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveClient() {
    setSaving(true);
    setError("");
    setMessage("");
    const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await readApiResponse(res);
    if (!res.ok) setError(data.error || "Failed to save client");
    else {
      setClient(draft);
      setMessage("Client saved successfully.");
    }
    setSaving(false);
  }

  async function deleteClient() {
    if (!confirm(`Delete client "${client?.clientId || id}"?`)) return;
    const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await readApiResponse(res);
    if (!res.ok) setError(data.error || "Failed to delete client");
    else window.location.href = "/clients";
  }

  async function createRole() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/clients/${encodeURIComponent(id)}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(roleForm),
    });
    const data = await readApiResponse(res);
    if (!res.ok) setError(data.error || "Failed to create role");
    else {
      setRoleForm(DEFAULT_ROLE);
      setModal(null);
      await loadRoles();
    }
    setSaving(false);
  }

  return (
    <AdminLayout title="Clients">
      <section className={detailStyles.page}>
        <div className={detailStyles.breadcrumb}>
          <Link href="/clients">Clients</Link>
          <span>/</span>
          <span>Client details</span>
        </div>

        <header className={detailStyles.header}>
          <div>
            <h1>{client?.clientId || "Client"}</h1>
            <p>Clients are applications and services that can request authentication of a user.</p>
          </div>
          {draft && (
            <div className={detailStyles.headerActions}>
              <StatusToggle label={draft.enabled ? "Enabled" : "Disabled"} value={draft.enabled !== false} onChange={(value) => updateDraft("enabled", value)} />
              <button className="btn btn-outline" type="button" onClick={deleteClient}>Action</button>
            </div>
          )}
        </header>

        <nav className={detailStyles.tabs}>
          {TABS.map((tab) => (
            <button key={tab} className={activeTab === tab ? detailStyles.activeTab : ""} type="button" onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>

        {error && <div className={styles.alertError}>{error}</div>}
        {message && <div className={styles.alertSuccess}>{message}</div>}

        {loading || !draft ? (
          <div className="card">Loading client...</div>
        ) : activeTab === "Settings" ? (
          <ClientSettings draft={draft} updateDraft={updateDraft} saveClient={saveClient} loadClient={loadClient} saving={saving} />
        ) : (
          <ClientRoles
            filteredRoles={filteredRoles}
            roleQuery={roleQuery}
            setRoleQuery={setRoleQuery}
            loadRoles={loadRoles}
            openCreate={() => {
              setRoleForm(DEFAULT_ROLE);
              setModal("role");
            }}
          />
        )}
      </section>

      {modal === "role" && (
        <Modal
          title="Create role"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-outline" type="button" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={createRole} disabled={saving || !roleForm.name.trim()}>
                {saving ? "Creating..." : "Create role"}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Role name</label>
            <input className="form-input" value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={roleForm.description} onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))} />
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}

function ClientSettings({ draft, updateDraft, saveClient, loadClient, saving }) {
  return (
    <div className={detailStyles.formPanel}>
      <Field label="Client ID" required>
        <input value={draft.clientId || ""} onChange={(event) => updateDraft("clientId", event.target.value)} />
      </Field>
      <Field label="Name">
        <input value={draft.name || ""} onChange={(event) => updateDraft("name", event.target.value)} />
      </Field>
      <Field label="Description">
        <textarea rows={3} value={draft.description || ""} onChange={(event) => updateDraft("description", event.target.value)} />
      </Field>
      <Field label="Always display in UI">
        <StatusToggle label={draft.alwaysDisplayInConsole ? "On" : "Off"} value={Boolean(draft.alwaysDisplayInConsole)} onChange={(value) => updateDraft("alwaysDisplayInConsole", value)} />
      </Field>
      <Field label="Root URL">
        <input value={draft.rootUrl || ""} onChange={(event) => updateDraft("rootUrl", event.target.value)} />
      </Field>
      <Field label="Home URL">
        <input value={draft.baseUrl || ""} onChange={(event) => updateDraft("baseUrl", event.target.value)} />
      </Field>
      <Field label="Valid redirect URIs">
        <textarea rows={2} value={(draft.redirectUris || []).join("\n")} onChange={(event) => updateDraft("redirectUris", event.target.value.split(/\r?\n/).filter(Boolean))} />
      </Field>
      <Field label="Web origins">
        <textarea rows={2} value={(draft.webOrigins || []).join("\n")} onChange={(event) => updateDraft("webOrigins", event.target.value.split(/\r?\n/).filter(Boolean))} />
      </Field>
      <Field label="Standard flow">
        <StatusToggle label={draft.standardFlowEnabled ? "On" : "Off"} value={Boolean(draft.standardFlowEnabled)} onChange={(value) => updateDraft("standardFlowEnabled", value)} />
      </Field>
      <Field label="Direct access grants">
        <StatusToggle label={draft.directAccessGrantsEnabled ? "On" : "Off"} value={Boolean(draft.directAccessGrantsEnabled)} onChange={(value) => updateDraft("directAccessGrantsEnabled", value)} />
      </Field>
      <Field label="Service accounts">
        <StatusToggle label={draft.serviceAccountsEnabled ? "On" : "Off"} value={Boolean(draft.serviceAccountsEnabled)} onChange={(value) => updateDraft("serviceAccountsEnabled", value)} />
      </Field>
      <div className={detailStyles.saveBar}>
        <button className="btn btn-primary" type="button" onClick={saveClient} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        <button className="btn btn-outline" type="button" onClick={loadClient} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

function ClientRoles({ filteredRoles, roleQuery, setRoleQuery, loadRoles, openCreate }) {
  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input value={roleQuery} onChange={(event) => setRoleQuery(event.target.value)} placeholder="Search role by name" />
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>Create role</button>
        <button className="btn btn-outline" type="button" onClick={loadRoles}><RefreshCw size={14} />Refresh</button>
        <span className={styles.range}>{filteredRoles.length ? `1 - ${filteredRoles.length}` : "0"}</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.clientsTable}>
          <thead>
            <tr>
              <th>Role name</th>
              <th>Composite</th>
              <th>Description</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRoles.length === 0 ? (
              <tr><td colSpan={4} className={styles.empty}>No roles in this client</td></tr>
            ) : (
              filteredRoles.map((role) => (
                <tr key={role.id || role.name}>
                  <td>{role.name}</td>
                  <td>{role.composite ? "True" : "False"}</td>
                  <td>{cleanDisplayText(role.description)}</td>
                  <td></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Field({ label, required = false, children }) {
  return (
    <div className={detailStyles.field}>
      <label>{label}{required && <span>*</span>}</label>
      <div>{children}</div>
    </div>
  );
}

function StatusToggle({ label, value, onChange }) {
  return (
    <span className={detailStyles.switchWrap}>
      <button type="button" className={`${detailStyles.switch} ${value ? detailStyles.on : ""}`} aria-pressed={value} onClick={() => onChange(!value)} />
      <span>{label}</span>
    </span>
  );
}
