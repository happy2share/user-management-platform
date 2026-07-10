"use client";

import { useMemo, useEffect, useState } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import { readApiResponse } from "../lib/api-response";
import "./groups.css";

function flattenGroups(groups, level = 0) {
  return groups.flatMap((group) => [
    { ...group, level },
    ...flattenGroups(group.subGroups || [], level + 1),
  ]);
}

export default function GroupsPage() {
  const { t } = useLanguage();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberStats, setMemberStats] = useState({ directCount: 0, totalCount: 0 });
  const [newGroupName, setNewGroupName] = useState("");
  const [parentGroupId, setParentGroupId] = useState("");
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState("");

  const flatGroups = useMemo(() => flattenGroups(groups), [groups]);

  async function loadGroups() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/groups", { cache: "no-store" });
      const data = await readApiResponse(res);

      if (!res.ok) {
        throw new Error(data.error || t("groups.failedLoad"));
      }

      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("groups.failedLoad"));
    } finally {
      setLoading(false);
    }
  }

  async function createGroup(e) {
    e.preventDefault();

    if (!newGroupName.trim()) {
      alert(t("groups.nameRequired"));
      return;
    }

    const res = await fetch("/api/groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newGroupName, parentId: parentGroupId || undefined }),
    });

    if (!res.ok) {
      const data = await readApiResponse(res);
      alert(data.error || t("groups.failedCreate"));
      return;
    }

    setNewGroupName("");
    setParentGroupId("");
    loadGroups();
  }

  async function deleteGroup(group) {
    if (!confirm(t("groups.deleteConfirm", { name: group.name }))) return;

    const res = await fetch(`/api/groups/${group.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await readApiResponse(res);
      alert(data.error || t("groups.failedDelete"));
      return;
    }

    if (selectedGroup?.id === group.id) {
      setSelectedGroup(null);
      setMembers([]);
      setMemberStats({ directCount: 0, totalCount: 0 });
    }

    loadGroups();
  }

  async function viewMembers(group) {
    try {
      setSelectedGroup(group);
      setMembersLoading(true);

      const res = await fetch(`/api/groups/${group.id}/members`, {
        cache: "no-store",
      });

      const data = await readApiResponse(res);

      if (!res.ok) {
        throw new Error(data.error || t("groups.failedMembers"));
      }

      if (Array.isArray(data)) {
        setMembers(data);
        setMemberStats({ directCount: data.length, totalCount: data.length });
      } else {
        setMembers(Array.isArray(data.members) ? data.members : []);
        setMemberStats({
          directCount: Number(data.directCount || 0),
          totalCount: Number(data.totalCount || 0),
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t("groups.failedMembers"));
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadGroups();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminLayout title={t("groups.title")}>
      <div className="page-header groups-header">
        <div>
          <div className="page-title">{t("groups.title")}</div>
          <div className="page-subtitle">{t("groups.subtitle")}</div>
        </div>

        <button className="btn btn-outline" onClick={loadGroups}>
          {t("common.refresh")}
        </button>
      </div>

      <div className="groups-layout">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{t("groups.createGroup")}</div>
              <div className="card-subtitle">{t("groups.createGroupSubtitle")}</div>
            </div>
          </div>

          <form className="groups-create-form" onSubmit={createGroup}>
            <input
              className="form-input"
              name="groupName"
              placeholder={t("groups.groupName")}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />

            <select
              className="form-input"
              value={parentGroupId}
              onChange={(event) => setParentGroupId(event.target.value)}
            >
              <option value="">{t("groups.parentNone")}</option>
              {flatGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {`${"- ".repeat(group.level)}${group.path || group.name}`}
                </option>
              ))}
            </select>

            <button className="btn btn-primary" type="submit">
              {t("common.create")}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{t("groups.title")}</div>
              <div className="card-subtitle">
                {t("groups.groupCount", { count: flatGroups.length })}
              </div>
            </div>
          </div>

          {loading && <p>{t("groups.loading")}</p>}

          {error && <p className="groups-error">{error}</p>}

          {!loading && !error && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("groups.group")}</th>
                    <th>{t("groups.path")}</th>
                    <th>{t("groups.subGroups")}</th>
                    <th>{t("groups.directMembers")}</th>
                    <th>{t("groups.totalMembers")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>

                <tbody>
                  {flatGroups.length === 0 ? (
                    <tr>
                      <td colSpan="6">
                        <div className="table-empty">
                          <div className="table-empty-title">{t("groups.noGroupsFound")}</div>
                          <div className="table-empty-subtitle">{t("groups.createFirst")}</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    flatGroups.map((group) => (
                      <tr key={group.id}>
                        <td>
                          <strong>{`${"- ".repeat(group.level)}${group.name}`}</strong>
                          <div className="groups-id">{group.id}</div>
                        </td>

                        <td>{group.path || t("common.dash")}</td>

                        <td>
                          <span className="badge badge-blue">
                            {group.subGroupCount || 0}
                          </span>
                        </td>

                        <td>
                          <span className="badge badge-gray">
                            {group.directMemberCount || 0}
                          </span>
                        </td>

                        <td>
                          <span className="badge badge-success">
                            {group.memberCount || 0}
                          </span>
                        </td>

                        <td>
                          <div className="table-actions">
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => viewMembers(group)}
                            >
                              {t("groups.members")}
                            </button>

                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => deleteGroup(group)}
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
        </div>

        {selectedGroup && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  {t("groups.membersTitle", { name: selectedGroup.path || selectedGroup.name })}
                </div>
                <div className="card-subtitle">
                  {t("groups.memberStats", { direct: memberStats.directCount, total: memberStats.totalCount })}
                </div>
              </div>

              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setSelectedGroup(null);
                  setMembers([]);
                  setMemberStats({ directCount: 0, totalCount: 0 });
                }}
              >
                {t("common.close")}
              </button>
            </div>

            {membersLoading && <p>{t("groups.loadingMembers")}</p>}

            {!membersLoading && members.length === 0 && (
              <div className="table-empty">
                <div className="table-empty-title">{t("groups.noMembers")}</div>
                <div className="table-empty-subtitle">{t("groups.noMembersSubtitle")}</div>
              </div>
            )}

            {!membersLoading && members.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("common.username")}</th>
                      <th>{t("common.name")}</th>
                      <th>{t("common.email")}</th>
                      <th>{t("common.status")}</th>
                    </tr>
                  </thead>

                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td>{member.username}</td>
                        <td>
                          {[member.firstName, member.lastName]
                            .filter(Boolean)
                            .join(" ") || t("common.dash")}
                        </td>
                        <td>{member.email || t("common.dash")}</td>
                        <td>
                          <span
                            className={
                              member.enabled
                                ? "badge badge-success"
                                : "badge badge-danger"
                            }
                          >
                            {member.enabled ? t("common.enabled") : t("common.disabled")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
