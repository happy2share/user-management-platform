"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import Modal from "../components/common/Modal";
import { useLanguage } from "../i18n/LanguageProvider";
import { getRoleLabel } from "../i18n/role-labels";
import { readApiResponse } from "../lib/api-response";
import styles from "./users.module.css";

const DEFAULT_FORM = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  roles: [],
  groups: [],
  enabled: true,
};

async function getResponseError(response, fallback) {
  try {
    const data = await readApiResponse(response);
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function humanizeRoleName(roleName) {
  return String(roleName || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function flattenGroups(groups, level = 0) {
  return groups.flatMap((group) => [
    {
      id: group.id,
      name: group.name,
      path: group.path || group.name,
      level,
    },
    ...flattenGroups(group.subGroups || [], level + 1),
  ]);
}

export default function UsersPage() {
  const { language, t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  const [verificationLink, setVerificationLink] = useState("");
  const [localOtpCode, setLocalOtpCode] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formOptionsLoading, setFormOptionsLoading] = useState(false);
  const [actionUserId, setActionUserId] = useState(null);
  const [formError, setFormError] = useState("");
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({
    password: "",
    confirmPassword: "",
    temporary: false,
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/users");
      if (!res.ok) {
        throw new Error(await getResponseError(res, t("users.failedFetch")));
      }

      const data = await readApiResponse(res);
      const rawUsers = Array.isArray(data) ? data : (data.users ?? []);
      setUsers(rawUsers.map((user) => ({ ...user, enabled: user.enabled !== false })));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.failedFetch"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups?options=true", { cache: "no-store" });
      if (!res.ok) return;
      const data = await readApiResponse(res);
      setGroupOptions(flattenGroups(Array.isArray(data) ? data : []));
    } catch {
      setGroupOptions([]);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/roles", { cache: "no-store" });
      if (!res.ok) return;
      const data = await readApiResponse(res);
      const roles = Array.isArray(data) ? data : [];
      setRoleOptions(
        roles
          .filter((role) => role?.name)
          .map((role) => ({
            name: role.name,
            description: role.description || "",
            composite: role.composite === true,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch {
      setRoleOptions([]);
    }
  }, []);

  const loadFormOptions = useCallback(async () => {
    setFormOptionsLoading(true);
    try {
      await Promise.all([fetchGroups(), fetchRoles()]);
    } finally {
      setFormOptionsLoading(false);
    }
  }, [fetchGroups, fetchRoles]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchUsers();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [fetchUsers]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !query ||
        [user.username, user.email, user.firstName, user.lastName].some(
          (value) => value?.toLowerCase().includes(query),
        );
      const matchesStatus =
        filter === "all" ||
        (filter === "active" && user.enabled === true) ||
        (filter === "disabled" && user.enabled === false);

      return matchesSearch && matchesStatus;
    });
  }, [filter, search, users]);

  function closeModal() {
    if (saving) return;
    setModal(null);
    setEditing(null);
    setFormError("");
  }

  function validateForm(requirePassword) {
    if (!form.username.trim() || !form.email.trim()) {
      return t("users.usernameEmailRequired");
    }

    if (requirePassword && !form.password) {
      return t("users.passwordRequired");
    }

    return "";
  }

  async function handleCreate() {
    const validationError = validateForm(true);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError("");
    setSuccess("");
    setVerificationLink("");
    setLocalOtpCode("");

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await readApiResponse(res);

      if (!res.ok) {
        throw new Error(data.error || t("users.failedCreate"));
      }

      setSuccess(data.message || t("users.created"));
      setVerificationLink(data.verificationPageLink || data.verificationLink || "");
      setLocalOtpCode(data.localOtpCode || "");
      closeModal();
      setForm(DEFAULT_FORM);
      await fetchUsers();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : t("users.failedCreate"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    const validationError = validateForm(false);
    if (validationError || !editing) {
      setFormError(validationError || t("users.noUserSelected"));
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        throw new Error(await getResponseError(res, t("users.failedUpdate")));
      }

      closeModal();
      await fetchUsers();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : t("users.failedUpdate"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(user) {
    setActionUserId(user.id);
    setError(null);

    try {
      const res = await fetch(`/api/users/${user.id}/toggle-enabled`, { method: "PATCH" });

      if (!res.ok) {
        throw new Error(
          await getResponseError(res, t("users.failedStatus")),
        );
      }

      await fetchUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("users.failedStatus"),
      );
    } finally {
      setActionUserId(null);
    }
  }

  async function handleDelete(user) {
    if (!confirm(t("users.deleteConfirm", { username: user.username })))
      return;

    setActionUserId(user.id);
    setError(null);

    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });

      if (!res.ok) {
        throw new Error(await getResponseError(res, t("users.failedDelete")));
      }

      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.failedDelete"));
    } finally {
      setActionUserId(null);
    }
  }

  function openEdit(user) {
    void loadFormOptions();
    setEditing(user);
    setForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      username: user.username || "",
      email: user.email || "",
      password: "",
      roles: user.realmRoles ?? [],
      groups: user.groups ?? [],
      enabled: user.enabled !== false,
    });
    setFormError("");
    setModal("edit");
  }

  function openResetPassword(user) {
    setResetPasswordUser(user);
    setResetPasswordForm({ password: "", confirmPassword: "", temporary: false });
    setFormError("");
    setModal("reset-password");
  }

  async function handleResetPassword() {
    if (!resetPasswordUser) return;

    if (!resetPasswordForm.password) {
      setFormError(t("users.passwordRequired"));
      return;
    }

    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      setFormError(t("users.passwordMismatch"));
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const res = await fetch(`/api/users/${resetPasswordUser.id}/reset-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: resetPasswordForm.password,
          temporary: resetPasswordForm.temporary,
        }),
      });

      if (!res.ok) {
        throw new Error(await getResponseError(res, t("users.passwordResetFailed")));
      }

      const data = await readApiResponse(res);
      setSuccess(data.message || t("users.passwordResetSuccess"));
      closeModal();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : t("users.passwordResetFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  function initials(u) {
    const f = u.firstName?.[0] || "";
    const l = u.lastName?.[0] || "";

    return (f + l).toUpperCase() || u.username?.[0]?.toUpperCase() || "?";
  }

  function statusBadge(u) {
    if (u.enabled !== true)
      return <span className="badge badge-danger">{t("common.disabled")}</span>;
    if (u.onboardingStatus === "EMAIL_VERIFICATION_REQUIRED")
      return <span className="badge badge-warning">{t("users.emailPending")}</span>;
    if (u.onboardingStatus === "MFA_SETUP_REQUIRED")
      return <span className="badge badge-warning">{t("users.mfaPending")}</span>;
    if (u.onboardingRequired)
      return <span className="badge badge-warning">{t("users.setupPending")}</span>;
    return <span className="badge badge-success">{t("common.active")}</span>;
  }

  return (
    <AdminLayout title={t("nav.users")}>
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t("users.title")}</h1>
          <p className="page-subtitle">
            {t("users.subtitle")}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            void loadFormOptions();
            setForm(DEFAULT_FORM);
            setFormError("");
            setModal("create");
          }}
        >
          {t("users.createUser")}
        </button>
      </div>

      {success && <div className={styles.successWrap}>{success}</div>}
      {verificationLink && (
        <div className={styles.successWrap}>
          {t("users.verificationPage")} <a href={verificationLink}>{verificationLink}</a>
        </div>
      )}
      {localOtpCode && (
        <div className={styles.successWrap}>
          {t("auth.localTestingEmailOtp")} <strong>{localOtpCode}</strong>
        </div>
      )}

      <div className="card">
        {/* Toolbar */}
        <div className="action-row">
          <div className="search-wrap">
            <input
              className="search-input"
              placeholder={t("users.searchPlaceholder")}
              aria-label={t("users.searchAria")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="form-input"
            style={{ width: 140 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{t("users.allStatuses")}</option>
            <option value="active">{t("common.active")}</option>
            <option value="disabled">{t("common.disabled")}</option>
          </select>

          <div className="spacer" />

          <button className="btn btn-outline btn-sm" onClick={fetchUsers}>
            {t("common.refresh")}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className={styles.loadingWrap}>
            <div className="spinner" />
          </div>
        ) : error ? (
          <div className={styles.errorWrap}>
            <p>{t("users.failedLoadWithError", { error })}</p>
            <button className="btn btn-outline btn-sm" onClick={fetchUsers}>
              {t("common.retry")}
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("users.user")}</th>
                  <th>{t("users.fullName")}</th>
                  <th>{t("users.roles")}</th>
                  <th>{t("users.groups")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("users.createdAt")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <p>{t("users.noUsersFound")}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className={styles.userCell}>
                          <div
                            className="avatar"
                            style={{ width: 32, height: 32, fontSize: 11 }}
                          >
                            {initials(user)}
                          </div>
                          <div>
                            <div className={styles.username}>
                              {user.username}
                            </div>
                            <div className={styles.email}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {[user.firstName, user.lastName]
                          .filter(Boolean)
                          .join(" ") || "-"}
                      </td>
                      <td>
                        <div className={styles.roleList}>
                          {(user.realmRoles ?? []).slice(0, 3).map((r) => (
                            <span key={r} className="badge badge-blue">
                              {getRoleLabel(r, language)}
                            </span>
                          ))}
                          {(user.realmRoles ?? []).length > 3 && (
                            <span className="badge badge-gray">
                              +{user.realmRoles.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.roleList}>
                          {(user.groupPaths ?? []).slice(0, 2).map((groupPath) => (
                            <span key={groupPath} className="badge badge-gray">
                              {groupPath}
                            </span>
                          ))}
                          {(user.groupPaths ?? []).length === 0 && (
                            <span className="text-muted text-sm">{t("common.dash")}</span>
                          )}
                          {(user.groupPaths ?? []).length > 2 && (
                            <span className="badge badge-gray">
                              +{user.groupPaths.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{statusBadge(user)}</td>
                      <td className="text-muted text-sm">
                        {user.createdTimestamp
                          ? new Date(user.createdTimestamp).toLocaleDateString()
                          : t("common.dash")}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openEdit(user)}
                            disabled={actionUserId === user.id}
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openResetPassword(user)}
                            disabled={actionUserId === user.id}
                          >
                            {t("users.resetPassword")}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => toggleStatus(user)}
                            disabled={actionUserId === user.id}
                          >
                            {user.enabled === true ? t("common.disable") : t("common.enable")}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(user)}
                            disabled={actionUserId === user.id}
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
        )}

        {/* Pagination info */}
        {!loading && !error && (
          <div className="pagination">
            <span className="pagination-info">
              {t("users.showingCount", { shown: filtered.length, total: users.length })}
            </span>
          </div>
        )}
      </div>

      {/* ── Create Modal  */}
      {modal === "create" && (
        <Modal
          title={t("users.createNewUser")}
          onClose={closeModal}
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={closeModal}
                disabled={saving || formOptionsLoading}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={saving || formOptionsLoading}
              >
                {saving ? t("auth.creating") : t("users.createUser")}
              </button>
            </>
          }
        >
          {formError && <p className={styles.formError}>{formError}</p>}
          <UserForm form={form} setForm={setForm} roleOptions={roleOptions} groupOptions={groupOptions} showPassword />
        </Modal>
      )}

      {/*Edit Modal*/}
      {modal === "edit" && editing && (
        <Modal
          title={t("users.editUser", { username: editing.username })}
          onClose={closeModal}
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={closeModal}
                disabled={saving || formOptionsLoading}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpdate}
                disabled={saving || formOptionsLoading}
              >
                {saving ? t("common.saving") : t("users.saveChanges")}
              </button>
            </>
          }
        >
          {formError && <p className={styles.formError}>{formError}</p>}
          <UserForm form={form} setForm={setForm} roleOptions={roleOptions} groupOptions={groupOptions} />
        </Modal>
      )}

      {/* Reset Password Modal */}
      {modal === "reset-password" && resetPasswordUser && (
        <Modal
          title={t("users.resetPasswordTitle", { username: resetPasswordUser.username })}
          onClose={closeModal}
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={closeModal}
                disabled={saving}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleResetPassword}
                disabled={saving}
              >
                {saving ? t("auth.resettingPassword") : t("users.resetPassword")}
              </button>
            </>
          }
        >
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className="form-group">
            <label className="form-label">{t("auth.newPassword")}</label>
            <input
              className="form-input"
              name="newPassword"
              type="password"
              placeholder={t("users.newPasswordPlaceholder")}
              value={resetPasswordForm.password}
              required
              onChange={(e) =>
                setResetPasswordForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("auth.confirmNewPassword")}</label>
            <input
              className="form-input"
              name="confirmPassword"
              type="password"
              placeholder={t("users.confirmPasswordPlaceholder")}
              value={resetPasswordForm.confirmPassword}
              required
              onChange={(e) =>
                setResetPasswordForm((f) => ({
                  ...f,
                  confirmPassword: e.target.value,
                }))
              }
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t("users.temporaryPassword")}</div>
              <p className="form-hint">{t("users.temporaryPasswordHint")}</p>
            </div>
            <button
              type="button"
              className={`toggle ${resetPasswordForm.temporary ? "on" : ""}`}
              role="switch"
              aria-checked={resetPasswordForm.temporary}
              aria-label={t("users.temporaryPassword")}
              onClick={() =>
                setResetPasswordForm((f) => ({
                  ...f,
                  temporary: !f.temporary,
                }))
              }
            />
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}

// Shared form component
function UserForm({ form, setForm, roleOptions = [], groupOptions = [], showPassword = false }) {
  const { language, t } = useLanguage();
  const visibleRoleOptions = useMemo(() => {
    const byName = new Map(roleOptions.map((role) => [role.name, role]));
    for (const roleName of form.roles || []) {
      if (!byName.has(roleName)) {
        byName.set(roleName, { name: roleName, description: "", composite: false });
      }
    }
    return [...byName.values()];
  }, [form.roles, roleOptions]);

  function toggleRole(role) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role)
        ? f.roles.filter((r) => r !== role)
        : [...f.roles, role],
    }));
  }

  function toggleGroup(groupId) {
    setForm((f) => ({
      ...f,
      groups: f.groups.includes(groupId)
        ? f.groups.filter((id) => id !== groupId)
        : [...f.groups, groupId],
    }));
  }

  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{t("users.firstName")}</label>
          <input
            className="form-input"
            name="firstName"
            placeholder="John"
            value={form.firstName}
            onChange={(e) =>
              setForm((f) => ({ ...f, firstName: e.target.value }))
            }
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t("users.lastName")}</label>
          <input
            className="form-input"
            name="lastName"
            placeholder="Doe"
            value={form.lastName}
            onChange={(e) =>
              setForm((f) => ({ ...f, lastName: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t("common.username")}</label>
        <input
          className="form-input"
          name="username"
          placeholder="john.doe"
          value={form.username}
          required
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
        />
      </div>

      <div className="form-group">
        <label className="form-label">{t("common.email")}</label>
        <input
          className="form-input"
          name="email"
          type="email"
          placeholder="john.doe@car-service.local"
          value={form.email}
          required
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
      </div>

      {showPassword && (
        <div className="form-group">
          <label className="form-label">{t("auth.password")}</label>
          <input
            className="form-input"
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            required
            onChange={(e) =>
              setForm((f) => ({ ...f, password: e.target.value }))
            }
          />
          <p className="form-hint">
            {t("users.passwordHint")}
          </p>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">{t("users.assignRoles")}</label>
        <div className={styles.roleOptions}>
          {visibleRoleOptions.length === 0 ? (
            <span className="text-muted text-sm">No realm roles found</span>
          ) : (
            visibleRoleOptions.map((role) => {
              const label = getRoleLabel(role.name, language);
              return (
                <button
                  key={role.name}
                  type="button"
                  className={`badge ${form.roles.includes(role.name) ? "badge-blue" : "badge-gray"}`}
                  aria-pressed={form.roles.includes(role.name)}
                  onClick={() => toggleRole(role.name)}
                  title={role.description || role.name}
                >
                  {label === role.name ? humanizeRoleName(role.name) : label}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t("users.assignGroups")}</label>
        <div className={styles.groupOptions}>
          {groupOptions.length === 0 ? (
            <span className="text-muted text-sm">{t("users.noGroupsAvailable")}</span>
          ) : (
            groupOptions.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`badge ${form.groups.includes(group.id) ? "badge-blue" : "badge-gray"}`}
                aria-pressed={form.groups.includes(group.id)}
                onClick={() => toggleGroup(group.id)}
                title={group.path}
              >
                {`${"- ".repeat(group.level)}${group.path}`}
              </button>
            ))
          )}
        </div>
        <p className="form-hint">{t("users.groupsHint")}</p>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t("users.accountEnabled")}</div>
        </div>
        <button
          type="button"
          className={`toggle ${form.enabled ? "on" : ""}`}
          role="switch"
          aria-checked={form.enabled}
          aria-label={t("users.accountEnabled")}
          onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
        />
      </div>
    </>
  );
}
