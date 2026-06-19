"use client";

import { useEffect, useState } from "react";
import AdminLayout from "../components/layout/AdminLayout";
import { useLanguage } from "../i18n/LanguageProvider";
import styles from "./authentication.module.css";

const DEFAULTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSpecialChars: true,
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
};

export default function AuthenticationPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadSettings() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/authentication", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) setError(data.error || t("authentication.failedLoad"));
    else setForm({ ...DEFAULTS, ...data });
    setLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadSettings();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings() {
    setSaving(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/authentication", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || t("authentication.failedSave"));
    else setMessage(t("authentication.saved"));
    setSaving(false);
  }

  return (
    <AdminLayout title={t("authentication.title")}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("authentication.title")}</h1>
          <p className="page-subtitle">{t("authentication.subtitle")}</p>
        </div>
        <button className="btn btn-primary" onClick={saveSettings} disabled={saving || loading}>
          {saving ? t("common.saving") : t("authentication.saveToKeycloak")}
        </button>
      </div>

      {error && <div className="card" style={{ color: "#b91c1c" }}>{error}</div>}
      {message && <div className="card" style={{ color: "#047857" }}>{message}</div>}
      {loading ? <div className="card">{t("authentication.loading")}</div> : (
        <div className={styles.panelStack}>
          <div className="card">
            <div className="card-header"><p className="card-title">{t("authentication.passwordPolicy")}</p></div>
            <SettingInput label={t("authentication.minimumLength")} value={form.minLength} onChange={(v) => update("minLength", Number(v))} />
            <SettingToggle label={t("authentication.requireUppercase")} value={form.requireUppercase} onChange={(v) => update("requireUppercase", v)} />
            <SettingToggle label={t("authentication.requireLowercase")} value={form.requireLowercase} onChange={(v) => update("requireLowercase", v)} />
            <SettingToggle label={t("authentication.requireDigits")} value={form.requireDigits} onChange={(v) => update("requireDigits", v)} />
            <SettingToggle label={t("authentication.requireSpecialCharacters")} value={form.requireSpecialChars} onChange={(v) => update("requireSpecialChars", v)} />
            <SettingInput label={t("authentication.passwordHistoryCount")} value={form.passwordHistory} onChange={(v) => update("passwordHistory", Number(v))} />
            <SettingInput label={t("authentication.passwordExpiryDays")} value={form.passwordExpiryDays} onChange={(v) => update("passwordExpiryDays", Number(v))} />
            <div className="settings-row">
              <div>
                <div className="settings-row-label">{t("authentication.currentKeycloakPolicy")}</div>
                <div className="settings-row-sub">{form.passwordPolicy || t("authentication.noPasswordPolicy")}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><p className="card-title">{t("authentication.bruteForceProtection")}</p></div>
            <SettingToggle label={t("common.enabled")} value={form.bruteForceProtected} onChange={(v) => update("bruteForceProtected", v)} />
            <SettingInput label={t("authentication.maxLoginFailures")} value={form.failureFactor} onChange={(v) => update("failureFactor", Number(v))} />
            <SettingInput label={t("authentication.waitIncrementSeconds")} value={form.waitIncrementSeconds} onChange={(v) => update("waitIncrementSeconds", Number(v))} />
            <SettingInput label={t("authentication.maxWaitSeconds")} value={form.maxFailureWaitSeconds} onChange={(v) => update("maxFailureWaitSeconds", Number(v))} />
            <SettingToggle label={t("authentication.permanentLockout")} value={form.permanentLockout} onChange={(v) => update("permanentLockout", v)} />
          </div>

          <div className="card">
            <div className="card-header"><p className="card-title">{t("authentication.otpPolicy")}</p></div>
            <SettingSelect label={t("authentication.otpType")} value={form.otpPolicyType} options={["totp", "hotp"]} onChange={(v) => update("otpPolicyType", v)} />
            <SettingSelect label={t("authentication.algorithm")} value={form.otpPolicyAlgorithm} options={["HmacSHA1", "HmacSHA256", "HmacSHA512"]} onChange={(v) => update("otpPolicyAlgorithm", v)} />
            <SettingInput label={t("authentication.digits")} value={form.otpPolicyDigits} onChange={(v) => update("otpPolicyDigits", Number(v))} />
            <SettingInput label={t("authentication.lookAheadWindow")} value={form.otpPolicyLookAheadWindow} onChange={(v) => update("otpPolicyLookAheadWindow", Number(v))} />
            <SettingInput label={t("authentication.tokenPeriodSeconds")} value={form.otpPolicyPeriod} onChange={(v) => update("otpPolicyPeriod", Number(v))} />
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function SettingInput({ label, value, onChange }) {
  return <div className="settings-row"><div><div className="settings-row-label">{label}</div></div><input className="form-input" type="number" value={value ?? 0} onChange={(e) => onChange(e.target.value)} style={{ width: 110 }} /></div>;
}

function SettingToggle({ label, value, onChange }) {
  return <div className="settings-row"><div><div className="settings-row-label">{label}</div></div><button type="button" className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} /></div>;
}

function SettingSelect({ label, value, options, onChange }) {
  return <div className="settings-row"><div><div className="settings-row-label">{label}</div></div><select className="form-input" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 170 }}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
}
