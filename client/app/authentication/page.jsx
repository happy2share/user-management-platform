"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import { readApiResponse } from "../lib/api-response";
import styles from "./authentication.module.css";

const DEFAULT_SETTINGS = {
  minLength: 12,
  requireUppercase: false,
  requireLowercase: false,
  requireDigits: false,
  requireSpecialChars: false,
  passwordHistory: 0,
  passwordExpiryDays: 0,
  bruteForceProtected: false,
  failureFactor: 5,
  waitIncrementSeconds: 60,
  maxFailureWaitSeconds: 900,
  permanentLockout: false,
  otpPolicyType: "totp",
  otpPolicyAlgorithm: "HmacSHA1",
  otpPolicyDigits: 6,
  otpPolicyLookAheadWindow: 1,
  otpPolicyPeriod: 30,
  passwordPolicy: "",
};

export default function AuthenticationPage() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/authentication", { cache: "no-store" });
    const data = await readApiResponse(res);

    setLoading(false);

    if (!res.ok) {
      setError(data.error || t("authentication.failedLoad"));
      return;
    }

    setSettings({ ...DEFAULT_SETTINGS, ...data });
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSettings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/authentication", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await readApiResponse(res);

    setSaving(false);

    if (!res.ok) {
      setError(data.error || t("authentication.failedSave"));
      return;
    }

    setMessage(t("authentication.saved"));
    loadSettings();
  }

  return (
    <AdminLayout title={t("authentication.title")}>
      <form className={styles.shell} onSubmit={saveSettings}>
        <header className={styles.header}>
          <div>
            <h1>{t("authentication.title")}</h1>
            <p>{t("authentication.subtitle")}</p>
          </div>
          <div className={styles.headerActions}>
            <button className="btn btn-outline" type="button" onClick={loadSettings} disabled={loading || saving}>
              <RefreshCw size={16} />
              {t("common.refresh")}
            </button>
            <button className="btn btn-primary" type="submit" disabled={loading || saving}>
              <Save size={16} />
              {saving ? t("common.saving") : t("authentication.saveToKeycloak")}
            </button>
          </div>
        </header>

        {loading && <div className={styles.notice}>{t("authentication.loading")}</div>}
        {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}
        {message && <div className={`${styles.notice} ${styles.success}`}>{message}</div>}

        <div className="grid-2">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{t("authentication.passwordPolicy")}</div>
                <div className="card-subtitle">{t("authentication.currentKeycloakPolicy")}</div>
              </div>
            </div>

            <div className={styles.formGrid}>
              <NumberField
                label={t("authentication.minimumLength")}
                value={settings.minLength}
                min={0}
                onChange={(value) => updateSetting("minLength", value)}
              />
              <NumberField
                label={t("authentication.passwordHistoryCount")}
                value={settings.passwordHistory}
                min={0}
                onChange={(value) => updateSetting("passwordHistory", value)}
              />
              <NumberField
                label={t("authentication.passwordExpiryDays")}
                value={settings.passwordExpiryDays}
                min={0}
                onChange={(value) => updateSetting("passwordExpiryDays", value)}
              />
            </div>

            <div className={styles.toggleList}>
              <Switch label={t("authentication.requireUppercase")} enabled={settings.requireUppercase} onChange={(value) => updateSetting("requireUppercase", value)} />
              <Switch label={t("authentication.requireLowercase")} enabled={settings.requireLowercase} onChange={(value) => updateSetting("requireLowercase", value)} />
              <Switch label={t("authentication.requireDigits")} enabled={settings.requireDigits} onChange={(value) => updateSetting("requireDigits", value)} />
              <Switch label={t("authentication.requireSpecialCharacters")} enabled={settings.requireSpecialChars} onChange={(value) => updateSetting("requireSpecialChars", value)} />
            </div>

            <div className={styles.policyPreview}>
              {settings.passwordPolicy || t("authentication.noPasswordPolicy")}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{t("authentication.bruteForceProtection")}</div>
                <div className="card-subtitle">Keycloak realm login lockout controls</div>
              </div>
            </div>

            <div className={styles.toggleList}>
              <Switch label={t("authentication.bruteForceProtection")} enabled={settings.bruteForceProtected} onChange={(value) => updateSetting("bruteForceProtected", value)} />
              <Switch label={t("authentication.permanentLockout")} enabled={settings.permanentLockout} onChange={(value) => updateSetting("permanentLockout", value)} />
            </div>

            <div className={styles.formGrid}>
              <NumberField
                label={t("authentication.maxLoginFailures")}
                value={settings.failureFactor}
                min={1}
                onChange={(value) => updateSetting("failureFactor", value)}
              />
              <NumberField
                label={t("authentication.waitIncrementSeconds")}
                value={settings.waitIncrementSeconds}
                min={0}
                onChange={(value) => updateSetting("waitIncrementSeconds", value)}
              />
              <NumberField
                label={t("authentication.maxWaitSeconds")}
                value={settings.maxFailureWaitSeconds}
                min={0}
                onChange={(value) => updateSetting("maxFailureWaitSeconds", value)}
              />
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{t("authentication.otpPolicy")}</div>
              <div className="card-subtitle">Authenticator app OTP settings stored in Keycloak</div>
            </div>
          </div>

          <div className={styles.formGridWide}>
            <SelectField
              label={t("authentication.otpType")}
              value={settings.otpPolicyType}
              options={["totp", "hotp"]}
              onChange={(value) => updateSetting("otpPolicyType", value)}
            />
            <SelectField
              label={t("authentication.algorithm")}
              value={settings.otpPolicyAlgorithm}
              options={["HmacSHA1", "HmacSHA256", "HmacSHA512"]}
              onChange={(value) => updateSetting("otpPolicyAlgorithm", value)}
            />
            <SelectField
              label={t("authentication.digits")}
              value={String(settings.otpPolicyDigits)}
              options={["6", "8"]}
              onChange={(value) => updateSetting("otpPolicyDigits", Number(value))}
            />
            <NumberField
              label={t("authentication.lookAheadWindow")}
              value={settings.otpPolicyLookAheadWindow}
              min={0}
              onChange={(value) => updateSetting("otpPolicyLookAheadWindow", value)}
            />
            <NumberField
              label={t("authentication.tokenPeriodSeconds")}
              value={settings.otpPolicyPeriod}
              min={1}
              onChange={(value) => updateSetting("otpPolicyPeriod", value)}
            />
          </div>
        </section>
      </form>
    </AdminLayout>
  );
}

function NumberField({ label, value, min, onChange }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        className="form-input"
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Switch({ label, enabled, onChange }) {
  return (
    <button
      className={`${styles.switch} ${enabled ? styles.switchOn : ""}`}
      type="button"
      aria-pressed={enabled}
      onClick={() => onChange(!enabled)}
    >
      <span aria-hidden="true" />
      <b>{label}</b>
      <em>{enabled ? "On" : "Off"}</em>
    </button>
  );
}
