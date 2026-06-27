"use client";

import { useEffect, useState } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
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
};

export default function RealmPage() {
  const { t } = useLanguage();
  const [realm, setRealm] = useState(DEFAULT_REALM);
  const [settings, setSettings] = useState(DEFAULT_REALM);
  const [loading, setLoading] = useState(true);
  const [savingRealm, setSavingRealm] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
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
        realmRes.json(),
        settingsRes.json(),
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
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateSettings(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
    setRealm((current) => ({ ...current, [key]: value }));
  }

  async function saveRealm() {
    setSavingRealm(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/realms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(realm),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(data.error || t("realm.failedSaveRealm"));
      await loadRealm();
      setMessage(t("realm.realmSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("realm.failedSaveRealm"));
    } finally {
      setSavingRealm(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(data.error || t("realm.failedSaveSettings"));
      await loadRealm();
      setMessage(t("realm.settingsSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("realm.failedSaveSettings"));
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <AdminLayout title={t("realm.title")}>
      <div className="page-header realms-header">
        <div>
          <div className="page-title">{t("realm.title")}</div>
          <div className="page-subtitle">{t("realm.subtitle")}</div>
        </div>

        <button className="btn btn-outline" onClick={loadRealm} disabled={loading}>
          {t("common.refresh")}
        </button>
      </div>

      {error && <div className="card" style={{ color: "#b91c1c" }}>{error}</div>}
      {message && <div className="card" style={{ color: "#047857" }}>{message}</div>}

      {loading ? (
        <div className="card">{t("realm.loading")}</div>
      ) : (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{t("realm.details")}</div>
                <div className="card-subtitle">{t("realm.detailsSubtitle")}</div>
              </div>
            </div>

            <div className="realm-form-grid">
              <div className="form-group">
                <label className="form-label">{t("realm.realmName")}</label>
                <input className="form-input" value={realm.realm || settings.realmName || ""} disabled />
              </div>

              <div className="form-group">
                <label className="form-label">{t("realm.displayName")}</label>
                <input
                  className="form-input"
                  value={realm.displayName || ""}
                  onChange={(event) => updateRealm("displayName", event.target.value)}
                />
              </div>

              <RealmToggle label={t("realm.realmEnabled")} value={realm.enabled} onChange={(value) => updateRealm("enabled", value)} />
              <RealmToggle label={t("realm.userRegistration")} value={realm.registrationAllowed} onChange={(value) => updateRealm("registrationAllowed", value)} />
              <RealmToggle label={t("realm.loginWithEmail")} value={realm.loginWithEmailAllowed} onChange={(value) => updateRealm("loginWithEmailAllowed", value)} />
              <RealmToggle label={t("realm.passwordReset")} value={realm.resetPasswordAllowed} onChange={(value) => updateRealm("resetPasswordAllowed", value)} />
              <RealmToggle label={t("realm.rememberMe")} value={realm.rememberMe} onChange={(value) => updateRealm("rememberMe", value)} />
              <RealmToggle label={t("realm.verifyEmail")} value={realm.verifyEmail} onChange={(value) => updateRealm("verifyEmail", value)} />
              <RealmToggle label={t("realm.bruteForceProtection")} value={realm.bruteForceProtected} onChange={(value) => updateRealm("bruteForceProtected", value)} />
            </div>

            <div className="realm-actions">
              <button className="btn btn-primary" onClick={saveRealm} disabled={savingRealm}>
                {savingRealm ? t("common.saving") : t("realm.saveRealm")}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{t("realm.connectionSettings")}</div>
                <div className="card-subtitle">{t("realm.connectionSubtitle")}</div>
              </div>
            </div>

            <InfoRow label={t("realm.keycloakUrl")} value={settings.keycloakBaseUrl} />
            <InfoRow label={t("realm.title")} value={settings.realmName} />
            <InfoRow label={t("realm.adminApiClient")} value={settings.adminClientId} />
            <InfoRow label={t("realm.nextAuthUrl")} value={settings.nextAuthUrl} />

            <div className="settings-row">
              <div>
                <div className="settings-row-label">{t("realm.displayName")}</div>
              </div>
              <input
                className="form-input"
                value={settings.displayName || ""}
                onChange={(event) => updateSettings("displayName", event.target.value)}
                style={{ width: 260 }}
              />
            </div>

            <SettingToggle label={t("realm.realmEnabled")} value={settings.enabled} onChange={(value) => updateSettings("enabled", value)} />
            <SettingToggle label={t("realm.userRegistrationAllowed")} value={settings.registrationAllowed} onChange={(value) => updateSettings("registrationAllowed", value)} />
            <SettingToggle label={t("realm.forgotPasswordAllowed")} value={settings.resetPasswordAllowed} onChange={(value) => updateSettings("resetPasswordAllowed", value)} />
            <SettingToggle label={t("realm.rememberMe")} value={settings.rememberMe} onChange={(value) => updateSettings("rememberMe", value)} />
            <SettingToggle label={t("realm.loginWithEmail")} value={settings.loginWithEmailAllowed} onChange={(value) => updateSettings("loginWithEmailAllowed", value)} />
            <SettingToggle label={t("realm.duplicateEmailsAllowed")} value={settings.duplicateEmailsAllowed} onChange={(value) => updateSettings("duplicateEmailsAllowed", value)} />
            <SettingToggle label={t("realm.editUsernameAllowed")} value={settings.editUsernameAllowed} onChange={(value) => updateSettings("editUsernameAllowed", value)} />
            <SettingToggle label={t("realm.verifyEmail")} value={settings.verifyEmail} onChange={(value) => updateSettings("verifyEmail", value)} />

            <div className="realm-actions">
              <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings}>
                {savingSettings ? t("common.saving") : t("realm.saveSettings")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function InfoRow({ label, value }) {
  const { t } = useLanguage();

  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-label">{label}</div>
        <div className="settings-row-sub">{value || t("common.dash")}</div>
      </div>
    </div>
  );
}

function RealmToggle({ label, value, onChange }) {
  const { t } = useLanguage();

  return (
    <div className="realm-toggle-row">
      <div>
        <div className="realm-toggle-label">{label}</div>
        <div className="realm-toggle-value">{value ? t("common.enabled") : t("common.disabled")}</div>
      </div>

      <button
        type="button"
        className={`toggle ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
      />
    </div>
  );
}

function SettingToggle({ label, value, onChange }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-label">{label}</div>
      </div>
      <button
        type="button"
        className={`toggle ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
      />
    </div>
  );
}
