"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../components/common/Modal";
import AdminLayout from "../components/layout/AdminLayout";
import { cleanDisplayText } from "../lib/display-text";
import { readApiResponse } from "../lib/api-response";
import styles from "./roles.module.css";

const DEFAULT_FORM = { name: "", description: "" };

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/roles", { cache: "no-store" });
    const data = await readApiResponse(res);
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to load roles");
      return;
    }
    setRoles(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadRoles();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadRoles]);

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((role) => role.name?.toLowerCase().includes(q));
  }, [roles, query]);

  async function saveRole() {
    if (!form.name.trim()) return;
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      alert(data.error || "Failed to create role");
      return;
    }
    setModal(false);
    setForm(DEFAULT_FORM);
    loadRoles();
  }

  return (
    <AdminLayout title="Realm roles">
      <div className={styles.kcPageHeader}>
        <h1>Realm roles</h1>
        <p>Realm roles are the roles that you define for use in the current realm.</p>
      </div>

      <div className={styles.kcToolbar}>
        <div className={styles.searchBox}>
          <span>Search</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search role by name" />
          <button type="button" aria-label="Search">Go</button>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>Create role</button>
        <button className="btn btn-outline" onClick={loadRoles}>Refresh</button>
        <span className={styles.range}>{filteredRoles.length ? `1 - ${filteredRoles.length}` : "0"}</span>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.kcTableWrap}>
        <table className={styles.kcTable}>
          <thead>
            <tr>
              <th>Role name</th>
              <th>Composite</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoles.length === 0 ? (
              <tr>
                <td colSpan={4}>{loading ? "Loading roles..." : "No roles found"}</td>
              </tr>
            ) : (
              filteredRoles.map((role) => (
                <tr key={role.name}>
                  <td>
                    <Link className={styles.roleLink} href={`/roles/${encodeURIComponent(role.name)}`}>
                      {role.name}
                    </Link>
                  </td>
                  <td>{role.composite === true ? "True" : "False"}</td>
                  <td>{cleanDisplayText(role.description)}</td>
                  <td className={styles.moreCell}>
                    <Link href={`/roles/${encodeURIComponent(role.name)}`}>View/Edit</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title="Create role"
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveRole}>Create role</button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Role name</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
