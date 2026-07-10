"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "../i18n/LanguageProvider";
import { readApiResponse } from "../lib/api-response";
import "../components/auth/landing-auth.css";

function VerifyEmailContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState(searchParams.get("username") || searchParams.get("email") || "");
  const linkToken = searchParams.get("token") || "";
  const autoVerifyStarted = useRef(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [localOtpCode, setLocalOtpCode] = useState("");

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readApiResponse(response);
    return { response, data };
  }

  async function handleVerify(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const { response, data } = await postJson("/api/public/email-verification/verify", {
        username,
        identifier: username,
        otp,
      });

      if (!response.ok) {
        setError(data.error || t("verifyEmail.failed"));
        return;
      }

      setMessage(data.message || t("verifyEmail.success"));
      setOtp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("verifyEmail.failed"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!username || !linkToken || autoVerifyStarted.current) return;

    autoVerifyStarted.current = true;

    async function verifyLinkToken() {
      setBusy(true);
      setMessage("");
      setError("");

      try {
        const { response, data } = await postJson("/api/public/email-verification/verify", {
          username,
          identifier: username,
          token: linkToken,
        });

        if (!response.ok) {
          setError(data.error || t("verifyEmail.failed"));
          return;
        }

        setMessage(data.message || t("verifyEmail.success"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("verifyEmail.failed"));
      } finally {
        setBusy(false);
      }
    }

    verifyLinkToken();
  }, [linkToken, t, username]);

  async function handleResend() {
    setBusy(true);
    setMessage("");
    setError("");
    setLocalOtpCode("");

    try {
      const { response, data } = await postJson("/api/public/email-verification/send", {
        username,
        identifier: username,
      });

      if (!response.ok) {
        setError(data.error || t("verifyEmail.failedSend"));
        return;
      }

      if (data.localOtpCode) setLocalOtpCode(data.localOtpCode);
      setMessage(data.message || t("auth.emailOtpSent"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("verifyEmail.failedSend"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-title-block">
          <div className="auth-logo" aria-hidden="true" />
          <h1>{t("verifyEmail.title")}</h1>
        </div>

        <p className="auth-helper-text">
          {t("verifyEmail.helper")}
        </p>

        {message && <div className="auth-alert success">{message}</div>}
        {error && <div className="auth-alert error">{error}</div>}
        {localOtpCode && (
          <div className="auth-alert success">
            {t("verifyEmail.localTestingOtp")} <strong>{localOtpCode}</strong>
          </div>
        )}

        <form onSubmit={handleVerify} className="auth-form">
          <label>
            {t("verifyEmail.usernameOrEmail")}
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t("verifyEmail.usernamePlaceholder")}
              required
            />
          </label>
          <label>
            {t("auth.emailOtp")}
            <input
              name="otp"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
              placeholder={t("auth.enterSixDigitCode")}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
          </label>
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? t("auth.verifying") : t("auth.verifyEmail")}
          </button>
        </form>

        <button
          type="button"
          className="auth-secondary"
          disabled={busy || !username.trim()}
          onClick={handleResend}
          style={{ marginTop: 14 }}
        >
          {busy ? t("auth.sending") : t("auth.resendEmailOtp")}
        </button>

        <Link className="auth-link-button" href="/">
          {t("auth.backToLogin")}
        </Link>
      </section>
    </main>
  );
}

function LoadingFallback() {
  const { t } = useLanguage();

  return (
    <main className="auth-shell">
      <section className="auth-card">{t("common.loading")}</section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
