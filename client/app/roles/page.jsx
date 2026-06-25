"use client";

import { useEffect, useState } from "react";
import Modal from "../components/common/Modal";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import { getRoleLabel, hasRoleLabel } from "../i18n/role-labels";
import styles from "./roles.module.css";

const DEFAULT_FORM = { name: "", description: "" };

export default function RolesPage() {
  const { language, t } = useLanguage();
  const [roles, setRoles] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState("");

  async function loadRoles() {
    setError("");
    const res = await fetch("/api/roles", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setError(data.error || t("roles.failedLoad"));
    setRoles(data);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadRoles();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setModal(true);
  }

  function openEdit(role) {
    setEditing(role);
    setForm({ name: role.name, description: role.description || "" });
    setModal(true);
  }

  async function saveRole() {
    if (!form.name.trim()) return;
    const url = editing
      ? `/api/roles/${encodeURIComponent(editing.name)}`
      : "/api/roles";
    const res = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || t("roles.failedSave"));
    setModal(false);
    setForm(DEFAULT_FORM);
    setEditing(null);
    loadRoles();
  }

  async function handleDelete(name) {
    if (!confirm(t("roles.deleteConfirm", { name }))) return;
    const res = await fetch(`/api/roles/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || t("roles.failedDelete"));
    loadRoles();
  }

  return (
    <AdminLayout title={t("roles.title")}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t("roles.title")}</h1>
          <p className="page-subtitle">{t("roles.subtitle")}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          {t("roles.createRole")}
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
                <th>{t("roles.roleName")}</th>
                <th>{t("common.description")}</th>
                <th>{t("common.type")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      <p>{t("roles.noRolesFound")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.name}>
                    <td>
                      <div className={styles.roleDisplay}>
                        <span>{getRoleLabel(role.name, language)}</span>
                        {hasRoleLabel(role.name) && (
                          <code className={styles.roleName}>{role.name}</code>
                        )}
                      </div>
                    </td>
                    <td className="text-muted">{role.description || t("common.dash")}</td>
                    <td>
                      <span
                        className={`badge ${role.composite ? "badge-purple" : "badge-gray"}`}
                      >
                        {role.composite ? t("roles.composite") : t("roles.simple")}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openEdit(role)}
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(role.name)}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <Modal
          title={editing ? t("roles.editRole") : t("roles.createRole")}
          onClose={() => setModal(false)}
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => setModal(false)}
              >
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={saveRole}>
                {editing ? t("common.save") : t("roles.createRole")}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">{t("roles.roleName")}</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("common.description")}</label>
            <input
              className="form-input"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
