"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import { readApiResponse } from "../lib/api-response";
import "../realms/realms.css";

const DEFAULT_REALM = {
  realm: "",
  displayName: "",
  enabled: true,
  registrationAllowed: false,
  resetPasswordAllowed: true,
  rememberMe: false,
  loginWithEmailAllowed: true,
  duplicateEmailsAllowed: false,
  editUsernameAllowed: false,
  verifyEmail: false,
  bruteForceProtected: false,
  sslRequired: "external",
};

export default function RealmPage() {
  const { t } = useLanguage();
  const [realm, setRealm] = useState(DEFAULT_REALM);
  const [settings, setSettings] = useState(DEFAULT_REALM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadRealm() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const [realmRes, settingsRes] = await Promise.all([
        fetch("/api/realms", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const [realmData, settingsData] = await Promise.all([
        readApiResponse(realmRes),
        readApiResponse(settingsRes),
      ]);

      if (!realmRes.ok) throw new Error(realmData.error || t("realm.failedLoad"));
      if (!settingsRes.ok) throw new Error(settingsData.error || t("realm.failedSettings"));

      setRealm({ ...DEFAULT_REALM, ...realmData });
      setSettings({ ...DEFAULT_REALM, ...settingsData });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("realm.failedLoad"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadRealm();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateRealm(key, value) {
    setRealm((current) => ({ ...current, [key]: value }));
  }

  function updateSettings(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    setMessage("");

    const mergedSettings = {
      ...settings,
      enabled: realm.enabled,
      displayName: realm.displayName,
      registrationAllowed: realm.registrationAllowed,
      resetPasswordAllowed: realm.resetPasswordAllowed,
      rememberMe: realm.rememberMe,
      loginWithEmailAllowed: realm.loginWithEmailAllowed,
      verifyEmail: realm.verifyEmail,
    };

    const [realmResponse, settingsResponse] = await Promise.all([
      fetch("/api/realms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(realm),
      }),
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mergedSettings),
      }),
    ]);

    const [realmData, settingsData] = await Promise.all([
      readApiResponse(realmResponse),
      readApiResponse(settingsResponse),
    ]);

    if (!realmResponse.ok) setError(realmData.error || t("realm.failedSaveRealm"));
    else if (!settingsResponse.ok) setError(settingsData.error || t("realm.failedSaveSettings"));
    else {
      setSettings(mergedSettings);
      setMessage(t("realm.realmSaved"));
    }

    setSaving(false);
  }

  const realmName = realm.realm || settings.realmName || "";

  return (
    <AdminLayout title={t("realm.title")}>
      <section className="realm-page">
        <header className="realm-kc-header">
          <div>
            <h1>{realmName || t("realm.title")}</h1>
            <p>
              Realm settings control options for users, applications, roles, and groups in this realm.
              <a href="https://www.keycloak.org/docs/latest/server_admin/" target="_blank" rel="noreferrer">
                Learn more <ExternalLink size={12} />
              </a>
            </p>
          </div>

          <div className="realm-header-actions">
            <StatusToggle
              label={realm.enabled ? t("common.enabled") : t("common.disabled")}
              value={realm.enabled}
              onChange={(value) => updateRealm("enabled", value)}
            />
            <button className="btn btn-outline" type="button" onClick={loadRealm} disabled={loading}>
              {t("common.refresh")}
            </button>
          </div>
        </header>

        <div className="realm-section-title">General</div>

        {error && <div className="realm-alert error">{error}</div>}
        {message && <div className="realm-alert success">{message}</div>}

        {loading ? (
          <div className="card">{t("realm.loading")}</div>
        ) : (
          <div className="realm-form-panel">
            <RealmField label={t("realm.realmName")} required>
              <div className="realm-copy-input">
                <input value={realmName} disabled />
                <button type="button" aria-label="Copy realm name" onClick={() => navigator.clipboard?.writeText(realmName)}>
                  <Copy size={14} />
                </button>
              </div>
            </RealmField>

            <RealmField label={t("realm.displayName")}>
              <input value={realm.displayName || ""} onChange={(event) => updateRealm("displayName", event.target.value)} />
            </RealmField>

            <RealmField label="HTML Display name">
              <input value={realm.displayName || ""} disabled />
            </RealmField>

            <RealmField label="Frontend URL" info>
              <input value={settings.nextAuthUrl || ""} disabled />
            </RealmField>

            <RealmField label="Require SSL" info>
              <select value={realm.sslRequired || "external"} onChange={(event) => updateRealm("sslRequired", event.target.value)}>
                <option value="external">External requests</option>
                <option value="all">All requests</option>
                <option value="none">None</option>
              </select>
            </RealmField>

            <RealmField label="User-managed access" info>
              <StatusToggle label="Off" value={false} onChange={() => {}} />
            </RealmField>

            <RealmField label="Organizations" info>
              <StatusToggle label="Off" value={false} onChange={() => {}} />
            </RealmField>

            <RealmField label="Admin Permissions" info>
              <StatusToggle label="Off" value={false} onChange={() => {}} />
            </RealmField>

            <RealmField label={t("realm.userRegistration")}>
              <StatusToggle label={realm.registrationAllowed ? t("common.enabled") : t("common.disabled")} value={realm.registrationAllowed} onChange={(value) => updateRealm("registrationAllowed", value)} />
            </RealmField>

            <RealmField label={t("realm.loginWithEmail")}>
              <StatusToggle label={realm.loginWithEmailAllowed ? t("common.enabled") : t("common.disabled")} value={realm.loginWithEmailAllowed} onChange={(value) => updateRealm("loginWithEmailAllowed", value)} />
            </RealmField>

            <RealmField label={t("realm.passwordReset")}>
              <StatusToggle label={realm.resetPasswordAllowed ? t("common.enabled") : t("common.disabled")} value={realm.resetPasswordAllowed} onChange={(value) => updateRealm("resetPasswordAllowed", value)} />
            </RealmField>

            <RealmField label={t("realm.rememberMe")}>
              <StatusToggle label={realm.rememberMe ? t("common.enabled") : t("common.disabled")} value={realm.rememberMe} onChange={(value) => updateRealm("rememberMe", value)} />
            </RealmField>

            <RealmField label={t("realm.verifyEmail")}>
              <StatusToggle label={realm.verifyEmail ? t("common.enabled") : t("common.disabled")} value={realm.verifyEmail} onChange={(value) => updateRealm("verifyEmail", value)} />
            </RealmField>

            <RealmField label={t("realm.duplicateEmailsAllowed")}>
              <StatusToggle label={settings.duplicateEmailsAllowed ? t("common.enabled") : t("common.disabled")} value={settings.duplicateEmailsAllowed} onChange={(value) => updateSettings("duplicateEmailsAllowed", value)} />
            </RealmField>

            <RealmField label={t("realm.editUsernameAllowed")}>
              <StatusToggle label={settings.editUsernameAllowed ? t("common.enabled") : t("common.disabled")} value={settings.editUsernameAllowed} onChange={(value) => updateSettings("editUsernameAllowed", value)} />
            </RealmField>

            <RealmField label={t("realm.bruteForceProtection")}>
              <StatusToggle label={realm.bruteForceProtected ? t("common.enabled") : t("common.disabled")} value={realm.bruteForceProtected} onChange={(value) => updateRealm("bruteForceProtected", value)} />
            </RealmField>

            <RealmField label="Endpoints" info>
              <div className="realm-links">
                <a href={`${settings.keycloakBaseUrl}/realms/${realmName}/.well-known/openid-configuration`} target="_blank" rel="noreferrer">
                  OpenID Endpoint Configuration <ExternalLink size={12} />
                </a>
                <a href={`${settings.keycloakBaseUrl}/realms/${realmName}/protocol/saml/descriptor`} target="_blank" rel="noreferrer">
                  SAML 2.0 Identity Provider Metadata <ExternalLink size={12} />
                </a>
              </div>
            </RealmField>
          </div>
        )}

        <footer className="realm-save-bar">
          <button className="btn btn-primary" type="button" onClick={saveAll} disabled={saving || loading}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
          <button className="btn btn-outline" type="button" onClick={loadRealm} disabled={saving || loading}>
            Revert
          </button>
        </footer>
      </section>
    </AdminLayout>
  );
}

function RealmField({ label, required = false, info = false, children }) {
  return (
    <div className="realm-field">
      <label>
        {label}
        {required && <span>*</span>}
        {info && <small>i</small>}
      </label>
      <div>{children}</div>
    </div>
  );
}

function StatusToggle({ label, value, onChange }) {
  return (
    <span className="realm-switch-wrap">
      <button
        type="button"
        className={`realm-switch ${value ? "on" : ""}`}
        aria-pressed={value}
        onClick={() => onChange(!value)}
      />
      <span>{label}</span>
    </span>
  );
}
