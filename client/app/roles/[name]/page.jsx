"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/common/Modal";
import AdminLayout from "../../components/layout/AdminLayout";
import { cleanDisplayText } from "../../lib/display-text";
import { readApiResponse } from "../../lib/api-response";
import styles from "../roles.module.css";

function roleKey(role) {
  const source = role.clientRole
    ? role.clientUuid || role.containerId || role.clientId || role.source || "client"
    : "realm";
  return `${role.clientRole ? "client" : "realm"}:${source}:${role.name}`;
}

function attributeValueToText(value) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function sourceLabel(role) {
  if (!role.clientRole) return "realm";
  return role.clientId || role.source || role.containerId || "client";
}

function RoleTable({ rows, selected, toggle, empty, selectable = true }) {
  return (
    <div className={styles.kcTableWrap}>
      <table className={styles.kcTable}>
        <thead>
          <tr>
            {selectable && <th className={styles.checkCell}></th>}
            <th>Role name</th>
            <th>Source</th>
            <th>Inherited</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={selectable ? 5 : 4}>{empty}</td>
            </tr>
          ) : (
            rows.map((role) => (
              <tr key={roleKey(role)}>
                {selectable && (
                  <td>
                    <input
                      type="checkbox"
                      checked={!!selected[roleKey(role)]}
                      disabled={role.inherited === true}
                      onChange={() => toggle(role)}
                    />
                  </td>
                )}
                <td>{role.name}</td>
                <td>
                  <span className={styles.roleChip}>{sourceLabel(role)}</span>
                </td>
                <td>{role.inherited ? "True" : "False"}</td>
                <td>{cleanDisplayText(role.description)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function RoleDetailsPage({ params }) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({ name: decodedName, description: "", attributes: {} });
  const [tab, setTab] = useState("details");
  const [associated, setAssociated] = useState([]);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [hideInherited, setHideInherited] = useState(true);
  const [selected, setSelected] = useState({});
  const [modal, setModal] = useState(null);
  const [available, setAvailable] = useState([]);
  const [roleTypeFilter, setRoleTypeFilter] = useState("all");
  const [roleSearch, setRoleSearch] = useState("");
  const [error, setError] = useState("");
  const [attributeDraft, setAttributeDraft] = useState({ key: "", value: "" });
  const [editingAttribute, setEditingAttribute] = useState(null);

  const loadRole = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/roles/${encodeURIComponent(decodedName)}`, { cache: "no-store" });
    const data = await readApiResponse(res);
    if (!res.ok) {
      setError(data.error || "Failed to load role");
      return;
    }
    setRole(data);
    setForm({
      name: data.name || decodedName,
      description: data.description || "",
      attributes: data.attributes || {},
    });
  }, [decodedName]);

  const loadAssociated = useCallback(async () => {
    const res = await fetch(
      `/api/roles/${encodeURIComponent(decodedName)}/composites?inherited=${hideInherited ? "false" : "true"}`,
      { cache: "no-store" },
    );
    const data = await readApiResponse(res);
    if (res.ok) setAssociated(Array.isArray(data) ? data : []);
  }, [decodedName, hideInherited]);

  const loadUsers = useCallback(async () => {
    const res = await fetch(`/api/roles/${encodeURIComponent(decodedName)}/users`, { cache: "no-store" });
    const data = await readApiResponse(res);
    if (res.ok) setUsers(Array.isArray(data) ? data : []);
  }, [decodedName]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadRole();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadRole]);

  useEffect(() => {
    if (tab !== "associated") return undefined;
    const timeoutId = window.setTimeout(() => {
      loadAssociated();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAssociated, tab]);

  useEffect(() => {
    if (tab !== "users") return undefined;
    const timeoutId = window.setTimeout(() => {
      loadUsers();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadUsers, tab]);

  async function saveDetails(nextAttributes = form.attributes) {
    const res = await fetch(`/api/roles/${encodeURIComponent(decodedName)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        attributes: nextAttributes,
      }),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      alert(data.error || "Failed to save role");
      return;
    }
    if (data.name && data.name !== decodedName) {
      window.location.href = `/roles/${encodeURIComponent(data.name)}`;
      return;
    }
    loadRole();
  }

  async function deleteRole() {
    if (!confirm(`Delete role ${decodedName}?`)) return;
    const res = await fetch(`/api/roles/${encodeURIComponent(decodedName)}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/roles";
    else alert("Failed to delete role");
  }

  async function openAssignRoles() {
    setRoleSearch("");
    setSelected({});
    setRoleTypeFilter("all");
    const res = await fetch(
      `/api/roles/${encodeURIComponent(decodedName)}/composites/available`,
      { cache: "no-store" },
    );
    const rawBody = await res.text();
    let data = [];
    try {
      data = rawBody ? JSON.parse(rawBody) : [];
    } catch {
      data = { error: rawBody };
    }

    if (!res.ok) {
      alert(data.error || `Failed to load available roles (${res.status})`);
      return;
    }
    setAvailable(Array.isArray(data) ? data : []);
    setModal("assign");
  }

  async function assignSelected() {
    const roles = available.filter((item) => selected[roleKey(item)]);
    const res = await fetch(`/api/roles/${encodeURIComponent(decodedName)}/composites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles }),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      alert(data.error || "Failed to assign roles");
      return;
    }
    setModal(null);
    setSelected({});
    loadRole();
    loadAssociated();
  }

  async function unassignSelected() {
    const roles = associated.filter((item) => selected[roleKey(item)] && !item.inherited);
    if (!roles.length) return;
    const res = await fetch(`/api/roles/${encodeURIComponent(decodedName)}/composites`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles }),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      alert(data.error || "Failed to unassign roles");
      return;
    }
    setSelected({});
    loadRole();
    loadAssociated();
  }

  function toggle(item) {
    const key = roleKey(item);
    setSelected((current) => ({ ...current, [key]: !current[key] }));
  }

  function upsertAttribute() {
    const key = attributeDraft.key.trim();
    if (!key) return;
    const next = { ...(form.attributes || {}) };

    if (editingAttribute && editingAttribute !== key) {
      delete next[editingAttribute];
    }

    next[key] = attributeDraft.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    setForm((current) => ({ ...current, attributes: next }));
    setAttributeDraft({ key: "", value: "" });
    setEditingAttribute(null);
    saveDetails(next);
  }

  function startEditAttribute(key, value) {
    setEditingAttribute(key);
    setAttributeDraft({ key, value: attributeValueToText(value) });
  }

  function removeAttribute(key) {
    const next = { ...(form.attributes || {}) };
    delete next[key];
    setForm((current) => ({ ...current, attributes: next }));
    saveDetails(next);
  }

  const filteredAvailable = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return available.filter((item) => {
      const typeMatches =
        roleTypeFilter === "all" ||
        (roleTypeFilter === "realm" && !item.clientRole) ||
        (roleTypeFilter === "client" && item.clientRole);
      const searchText = `${sourceLabel(item)} ${item.name} ${item.description || ""}`.toLowerCase();
      return typeMatches && (!q || searchText.includes(q));
    });
  }, [available, roleSearch, roleTypeFilter]);

  const availableCounts = useMemo(
    () => ({
      all: available.length,
      realm: available.filter((item) => !item.clientRole).length,
      client: available.filter((item) => item.clientRole).length,
    }),
    [available],
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.username, user.email, user.firstName, user.lastName].some((value) =>
        String(value || "").toLowerCase().includes(q),
      ),
    );
  }, [userSearch, users]);

  return (
    <AdminLayout title="Role details">
      <div className={styles.roleDetailHeader}>
        <div className={styles.breadcrumb}>
          <Link href="/roles">Realm roles</Link> / <span>Role details</span>
        </div>
        <div className={styles.detailTitle}>
          <h1>{decodedName}</h1>
          {role?.composite && <span className={styles.compositePill}>Composite</span>}
          <button className="btn btn-danger btn-sm" style={{ marginLeft: "auto" }} onClick={deleteRole}>
            Delete
          </button>
        </div>
        {error && <div className={styles.errorBox}>{error}</div>}
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "details" ? styles.activeTab : ""}`} onClick={() => setTab("details")}>
            Details
          </button>
          <button className={`${styles.tab} ${tab === "associated" ? styles.activeTab : ""}`} onClick={() => setTab("associated")}>
            Associated roles
          </button>
          <button className={`${styles.tab} ${tab === "attributes" ? styles.activeTab : ""}`} onClick={() => setTab("attributes")}>
            Attributes
          </button>
          <button className={`${styles.tab} ${tab === "users" ? styles.activeTab : ""}`} onClick={() => setTab("users")}>
            Users in role
          </button>
        </div>
      </div>

      <div className={styles.detailBody}>
        {tab === "details" && (
          <>
            <div className={styles.formRow}>
              <label>Role name</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
            </div>
            <div className={styles.formRow}>
              <label>Description</label>
              <textarea className="form-input" rows={4} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />
            </div>
            <div className={styles.actionRow}>
              <button className="btn btn-primary" onClick={() => saveDetails()}>
                Save
              </button>
              <button className="btn btn-outline" onClick={loadRole}>
                Cancel
              </button>
            </div>
          </>
        )}

        {tab === "associated" && (
          <>
            <div className={styles.assignToolbar}>
              <label>
                <input type="checkbox" checked={hideInherited} onChange={(e) => setHideInherited(e.target.checked)} /> Hide inherited roles
              </label>
              <button className="btn btn-primary" onClick={openAssignRoles}>
                Assign roles
              </button>
              <button className="btn btn-outline" onClick={unassignSelected}>
                Unassign
              </button>
              <button className="btn btn-outline" onClick={loadAssociated}>
                Refresh
              </button>
            </div>
            <RoleTable rows={associated} selected={selected} toggle={toggle} empty="No associated roles found" />
          </>
        )}

        {tab === "attributes" && (
          <>
            <div className={styles.assignToolbar}>
              <input className="form-input" placeholder="Attribute name" value={attributeDraft.key} onChange={(e) => setAttributeDraft((current) => ({ ...current, key: e.target.value }))} />
              <input className="form-input" placeholder="Value or comma-separated values" value={attributeDraft.value} onChange={(e) => setAttributeDraft((current) => ({ ...current, value: e.target.value }))} />
              <button className="btn btn-primary" onClick={upsertAttribute}>
                {editingAttribute ? "Save attribute" : "Add attribute"}
              </button>
              {editingAttribute && (
                <button className="btn btn-outline" onClick={() => {
                  setEditingAttribute(null);
                  setAttributeDraft({ key: "", value: "" });
                }}>
                  Cancel
                </button>
              )}
            </div>
            <div className={styles.kcTableWrap}>
              <table className={styles.kcTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(form.attributes || {}).length === 0 ? (
                    <tr>
                      <td colSpan={3}>No attributes found</td>
                    </tr>
                  ) : (
                    Object.entries(form.attributes || {}).map(([key, value]) => (
                      <tr key={key}>
                        <td>{key}</td>
                        <td>{attributeValueToText(value)}</td>
                        <td>
                          <button className="btn btn-outline btn-sm" onClick={() => startEditAttribute(key, value)}>
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => removeAttribute(key)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "users" && (
          <>
            <div className={styles.assignToolbar}>
              <input className="form-input" placeholder="Search username or email" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
              <button className="btn btn-outline" onClick={loadUsers}>
                Refresh
              </button>
              <span className={styles.range}>{filteredUsers.length} users</span>
            </div>
            <div className={styles.kcTableWrap}>
              <table className={styles.kcTable}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>First name</th>
                    <th>Last name</th>
                    <th>Email</th>
                    <th>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No users found in this role</td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id || user.username}>
                        <td>{user.username}</td>
                        <td>{user.firstName || "-"}</td>
                        <td>{user.lastName || "-"}</td>
                        <td>{user.email || "-"}</td>
                        <td>{user.enabled === false ? "False" : "True"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {modal === "assign" && (
        <Modal
          title={`Assign roles to ${decodedName}`}
          onClose={() => setModal(null)}
          className={styles.assignRolesModal}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={assignSelected}>
                Assign
              </button>
            </>
          }
        >
          <div className={styles.assignToolbar}>
            <div className={styles.searchBox}>
              <span>Search</span>
              <input placeholder="Search roles" value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} />
            </div>
            <button className="btn btn-outline" onClick={openAssignRoles}>
              Refresh
            </button>
          </div>
          <div className={styles.roleTypeTabs} aria-label="Role type filter">
            <button
              type="button"
              className={`${styles.roleTypeTab} ${roleTypeFilter === "all" ? styles.activeRoleTypeTab : ""}`}
              onClick={() => setRoleTypeFilter("all")}
            >
              All roles <span>{availableCounts.all}</span>
            </button>
            <button
              type="button"
              className={`${styles.roleTypeTab} ${roleTypeFilter === "realm" ? styles.activeRoleTypeTab : ""}`}
              onClick={() => setRoleTypeFilter("realm")}
            >
              Realm roles <span>{availableCounts.realm}</span>
            </button>
            <button
              type="button"
              className={`${styles.roleTypeTab} ${roleTypeFilter === "client" ? styles.activeRoleTypeTab : ""}`}
              onClick={() => setRoleTypeFilter("client")}
            >
              Client roles <span>{availableCounts.client}</span>
            </button>
          </div>
          <RoleTable rows={filteredAvailable} selected={selected} toggle={toggle} empty="No available roles" />
        </Modal>
      )}
    </AdminLayout>
  );
}
