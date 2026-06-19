"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import LanguageSelector from "../../i18n/LanguageSelector";
import { useLanguage } from "../../i18n/LanguageProvider";
import { normalizeToEnglish } from "../../lib/english-normalizer";
import { roleTarget } from "../../lib/role-target";
import "./landing-auth.css";

const REGISTER_DEFAULTS = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function RequiredMark() {
  return <span className="auth-required" aria-label="required">*</span>;
}

function PasswordVisibilityToggle({ visible, onToggle, showLabel, hideLabel }) {
  const Icon = visible ? EyeOff : Eye;

  return (
    <button
      type="button"
      className="auth-password-toggle"
      onClick={onToggle}
      aria-label={visible ? hideLabel : showLabel}
      title={visible ? hideLabel : showLabel}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}

export default function LandingAuth() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  const [mode, setMode] = useState("login");
  const [loginStep, setLoginStep] = useState("password");
  const [registerStep, setRegisterStep] = useState("form");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [otp, setOtp] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [registerForm, setRegisterForm] = useState(REGISTER_DEFAULTS);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [setupUsername, setSetupUsername] = useState("");
  const [localOtpCode, setLocalOtpCode] = useState("");
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaSetupOtp, setMfaSetupOtp] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const roles = useMemo(() => session?.roles ?? [], [session]);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(roleTarget(roles));
    }
  }, [roles, router, status]);

  function resetLoginStep() {
    setLoginStep("password");
    setOtp("");
    setMfaSetup(null);
    setMfaSetupOtp("");
  }

  function resetRegisterFlow() {
    setRegisterStep("form");
    setEmailOtp("");
    setMfaSetup(null);
    setMfaSetupOtp("");
  }

  function clearMessages() {
    setError("");
    setMessage("");
    setSetupUsername("");
    setLocalOtpCode("");
  }

  function updateLogin(field, value) {
    setLoginForm((current) => ({
      ...current,
      [field]:
        field === "username"
          ? normalizeToEnglish(value, { username: true })
          : value,
    }));
  }

  function updateRegister(field, value) {
    setRegisterForm((current) => ({
      ...current,
      [field]:
        field === "username"
          ? normalizeToEnglish(value, { username: true })
          : value,
    }));
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function checkPassword(username, password) {
    try {
      const { response, data } = await postJson("/api/public/password-check", {
        username,
        password,
      });

      return { ok: response.ok, data };
    } catch {
      return {
        ok: false,
        data: { error: t("auth.keycloakPasswordCheckFailed") },
      };
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    clearMessages();
    setOtp("");

    const passwordCheck = await checkPassword(
      loginForm.username,
      loginForm.password,
    );

    if (!passwordCheck.ok || !passwordCheck.data?.passwordValid) {
      setBusy(false);
      setError(passwordCheck.data?.error || t("auth.invalidCredentials"));
      return;
    }

    if (passwordCheck.data?.status === "EMAIL_VERIFICATION_REQUIRED") {
      setBusy(false);
      setSetupUsername(loginForm.username);
      setError(t("auth.verifyEmailBeforeLogin"));
      return;
    }

    if (passwordCheck.data?.status === "MFA_SETUP_REQUIRED") {
      setBusy(false);
      setLoginStep("mfa-setup");
      setMessage(t("auth.passwordVerifiedSetupMfa"));
      return;
    }

    if (passwordCheck.data?.status === "ONBOARDING_REQUIRED") {
      setBusy(false);
      setSetupUsername(loginForm.username);
      setError(t("auth.accountSetupIncomplete"));
      return;
    }

    if (passwordCheck.data?.mfaConfigured) {
      setBusy(false);
      setLoginStep("otp");
      setMessage(t("auth.passwordVerifiedEnterOtp"));
      return;
    }

    const response = await signIn("keycloak-credentials", {
      redirect: false,
      username: loginForm.username,
      password: loginForm.password,
    });

    setBusy(false);

    if (!response?.ok) {
      setError(t("auth.invalidCredentials"));
      return;
    }

    router.refresh();
  }

  async function handleOtpSubmit(event) {
    event.preventDefault();
    setBusy(true);
    clearMessages();

    const response = await signIn("keycloak-credentials", {
      redirect: false,
      username: loginForm.username,
      password: loginForm.password,
      totp: otp,
    });

    setBusy(false);

    if (!response?.ok) {
      setError(t("auth.invalidCredentialsOrOtp"));
      return;
    }

    setLoginForm({ username: "", password: "" });
    setOtp("");
    router.refresh();
  }

  async function handleResendVerificationEmail() {
    if (!setupUsername) return;

    setBusy(true);
    setError("");
    setMessage("");
    setLocalOtpCode("");

    const { response, data } = await postJson("/api/public/email-verification/send", {
      username: setupUsername,
    });

    setBusy(false);

    if (!response.ok) {
      setError(data.error || t("auth.failedVerificationEmail"));
      return;
    }

    if (data.localOtpCode) setLocalOtpCode(data.localOtpCode);
    setMessage(data.message || t("auth.emailOtpSent"));
  }

  async function handleMfaSetupStart(credentials = loginForm) {
    setBusy(true);
    setError("");
    setMessage("");
    setMfaSetup(null);
    setMfaSetupOtp("");

    const { response, data } = await postJson("/api/public/mfa/setup", {
      username: credentials.username,
      password: credentials.password,
    });

    setBusy(false);

    if (!response.ok) {
      setError(data.error || t("auth.failedStartMfa"));
      return;
    }

    setMfaSetup(data);
    setMessage(data.message || t("auth.scanQrEnterOtp"));
  }

  async function handleMfaSetupVerify(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const { response, data } = await postJson("/api/public/mfa/verify", {
      username: loginForm.username,
      password: loginForm.password,
      otp: mfaSetupOtp,
    });

    setBusy(false);

    if (!response.ok) {
      setError(data.error || t("auth.invalidOtp"));
      return;
    }

    setMode("login");
    setMessage(data.message || t("auth.mfaCompletedLoginNow"));
    resetLoginStep();
    resetRegisterFlow();
    setSetupUsername("");
    setLocalOtpCode("");
    setRegisterForm(REGISTER_DEFAULTS);
    setLoginForm((current) => ({ username: current.username, password: "" }));
  }

  async function handleRegisterEmailVerify(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const username = registerForm.username.trim();
    const password = registerForm.password;
    const { response, data } = await postJson("/api/public/email-verification/verify", {
      username,
      identifier: username,
      otp: emailOtp,
    });

    if (!response.ok) {
      setBusy(false);
      setError(data.error || t("auth.emailVerificationFailed"));
      return;
    }

    setLoginForm({ username, password });
    setEmailOtp("");
    setRegisterStep("mfa");
    setMessage(t("auth.emailVerifiedSetupMfa"));

    const setup = await postJson("/api/public/mfa/setup", { username, password });
    setBusy(false);

    if (!setup.response.ok) {
      setError(setup.data.error || t("auth.failedStartMfa"));
      return;
    }

    setMfaSetup(setup.data);
  }

  async function handleRegister(event) {
    event.preventDefault();
    setBusy(true);
    clearMessages();

    if (registerForm.password !== registerForm.confirmPassword) {
      setBusy(false);
      setError(t("auth.passwordsMismatch"));
      return;
    }

    const { response, data } = await postJson("/api/public/register", registerForm);

    setBusy(false);

    if (!response.ok) {
      setError(data.error || t("auth.registrationFailed"));
      return;
    }

    if (data.localOtpCode) setLocalOtpCode(data.localOtpCode);
    setSetupUsername(registerForm.username);
    setMessage(
      data.message ||
        t("auth.registrationSuccessful"),
    );
    setRegisterStep("email");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-title-block">
          <div className="auth-logo" aria-hidden="true" />
          <h1>IAM Platform</h1>
          <LanguageSelector variant="auth" />
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              resetLoginStep();
              resetRegisterFlow();
              clearMessages();
            }}
          >
            {t("auth.login")}
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              resetLoginStep();
              resetRegisterFlow();
              clearMessages();
            }}
          >
            {t("auth.register")}
          </button>
        </div>

        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}

        {localOtpCode && (
          <div className="auth-alert success">
            {t("auth.localTestingEmailOtp")} <strong>{localOtpCode}</strong>
          </div>
        )}

        {setupUsername && registerStep === "email" && (
          <button
            type="button"
            className="auth-secondary"
            disabled={busy}
            onClick={handleResendVerificationEmail}
          >
            {busy ? t("auth.sending") : t("auth.resendEmailOtp")}
          </button>
        )}

        {mode === "login" ? (
          loginStep === "password" ? (
            <form onSubmit={handleLogin} className="auth-form">
              <label>
                <span>{t("auth.username")} <RequiredMark /></span>
                <input
                  name="username"
                  value={loginForm.username}
                  placeholder={t("auth.usernamePlaceholder")}
                  onChange={(event) =>
                    updateLogin("username", event.target.value)
                  }
                  required
                />
              </label>
              <label>
                <span>{t("auth.password")} <RequiredMark /></span>
                <span className="auth-password-field">
                  <input
                    name="password"
                    type={showLoginPassword ? "text" : "password"}
                    value={loginForm.password}
                    placeholder={t("auth.passwordPlaceholder")}
                    onChange={(event) =>
                      updateLogin("password", event.target.value)
                    }
                    required
                  />
                  <PasswordVisibilityToggle
                    visible={showLoginPassword}
                    onToggle={() => setShowLoginPassword((current) => !current)}
                    showLabel={t("common.show")}
                    hideLabel={t("common.hide")}
                  />
                </span>
              </label>
              <button className="auth-submit" disabled={busy} type="submit">
                {busy ? t("auth.verifying") : t("auth.login")}
              </button>
            </form>
          ) : loginStep === "mfa-setup" ? (
            <form onSubmit={handleMfaSetupVerify} className="auth-form">
              {!mfaSetup ? (
                <button
                  className="auth-submit"
                  disabled={busy}
                  type="button"
                  onClick={handleMfaSetupStart}
                >
                  {busy ? t("auth.preparingMfa") : t("auth.generateMfaQr")}
                </button>
              ) : (
                <>
                  <div className="auth-qr-box">
                    <img src={mfaSetup.qrImageUrl} alt={t("auth.mfaQrAlt")} />
                  </div>
                  <label>
                    <span>{t("auth.otpCode")} <RequiredMark /></span>
                    <input
                      name="mfaSetupOtp"
                      value={mfaSetupOtp}
                      onChange={(event) =>
                        setMfaSetupOtp(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder={t("auth.enterOtp")}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      autoFocus
                      required
                    />
                  </label>
                  <button className="auth-submit" disabled={busy} type="submit">
                    {busy ? t("auth.savingMfa") : t("auth.completeMfaSetup")}
                  </button>
                </>
              )}
              <button
                type="button"
                className="auth-link-button"
                disabled={busy}
                onClick={() => {
                  resetLoginStep();
                  clearMessages();
                  setLoginForm({ username: "", password: "" });
                }}
              >
                {t("auth.backToLogin")}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="auth-form">
              <label>
                <span>{t("auth.otpCode")} <RequiredMark /></span>
                <input
                  name="otp"
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder={t("auth.enterOtp")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  autoFocus
                  required
                />
              </label>
              <button className="auth-submit" disabled={busy} type="submit">
                {busy ? t("auth.verifying") : t("auth.verifyOtp")}
              </button>
              <button
                type="button"
                className="auth-link-button"
                disabled={busy}
                onClick={() => {
                  resetLoginStep();
                  clearMessages();
                  setLoginForm({ username: "", password: "" });
                }}
              >
                {t("auth.backToLogin")}
              </button>
            </form>
          )
        ) : registerStep === "form" ? (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="auth-two-col">
              <label>
                <span>{t("auth.firstName")} <RequiredMark /></span>
                <input
                  name="firstName"
                  value={registerForm.firstName}
                  onChange={(event) =>
                    updateRegister("firstName", event.target.value)
                  }
                  placeholder={t("auth.firstName")}
                  required
                />
              </label>
              <label>
                <span>{t("auth.lastName")} <RequiredMark /></span>
                <input
                  name="lastName"
                  value={registerForm.lastName}
                  onChange={(event) =>
                    updateRegister("lastName", event.target.value)
                  }
                  placeholder={t("auth.lastName")}
                  required
                />
              </label>
            </div>
            <label>
              <span>{t("auth.username")} <RequiredMark /></span>
              <input
                name="username"
                value={registerForm.username}
                onChange={(event) =>
                  updateRegister("username", event.target.value)
                }
                placeholder={t("auth.usernamePlaceholder")}
                required
              />
            </label>
            <label>
              <span>{t("auth.email")} <RequiredMark /></span>
              <input
                name="email"
                type="email"
                value={registerForm.email}
                onChange={(event) =>
                  updateRegister("email", event.target.value)
                }
                placeholder={t("auth.emailPlaceholder")}
                required
              />
            </label>
            <div className="auth-two-col">
              <label>
                <span>{t("auth.password")} <RequiredMark /></span>
                <span className="auth-password-field">
                  <input
                    name="password"
                    type={showRegisterPassword ? "text" : "password"}
                    value={registerForm.password}
                    onChange={(event) =>
                      updateRegister("password", event.target.value)
                    }
                    placeholder={t("auth.passwordPlaceholder")}
                    required
                  />
                  <PasswordVisibilityToggle
                    visible={showRegisterPassword}
                    onToggle={() => setShowRegisterPassword((current) => !current)}
                    showLabel={t("common.show")}
                    hideLabel={t("common.hide")}
                  />
                </span>
              </label>
              <label>
                <span>{t("auth.confirm")} <RequiredMark /></span>
                <span className="auth-password-field">
                  <input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={registerForm.confirmPassword}
                    onChange={(event) =>
                      updateRegister("confirmPassword", event.target.value)
                    }
                    placeholder={t("auth.confirmPasswordPlaceholder")}
                    required
                  />
                  <PasswordVisibilityToggle
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((current) => !current)}
                    showLabel={t("common.show")}
                    hideLabel={t("common.hide")}
                  />
                </span>
              </label>
            </div>
            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? t("auth.creating") : t("auth.register")}
            </button>
          </form>
        ) : registerStep === "email" ? (
          <form onSubmit={handleRegisterEmailVerify} className="auth-form">
            <label>
              <span>{t("auth.emailOtp")} <RequiredMark /></span>
              <input
                name="emailOtp"
                value={emailOtp}
                onChange={(event) =>
                  setEmailOtp(event.target.value.replace(/\D/g, ""))
                }
                placeholder={t("auth.enterSixDigitCode")}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                required
              />
            </label>
            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? t("auth.verifying") : t("auth.verifyEmail")}
            </button>
            <button
              type="button"
              className="auth-link-button"
              disabled={busy}
              onClick={() => {
                setRegisterStep("form");
                setEmailOtp("");
                setError("");
                setMessage("");
              }}
            >
              {t("auth.backToRegistration")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfaSetupVerify} className="auth-form">
            {mfaSetup && (
              <div className="auth-qr-box">
                <img src={mfaSetup.qrImageUrl} alt={t("auth.mfaQrAlt")} />
              </div>
            )}
            <label>
              <span>{t("auth.otpCode")} <RequiredMark /></span>
              <input
                name="mfaSetupOtp"
                value={mfaSetupOtp}
                onChange={(event) =>
                  setMfaSetupOtp(event.target.value.replace(/\D/g, ""))
                }
                placeholder={t("auth.enterOtp")}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                autoFocus
                required
              />
            </label>
            <button className="auth-submit" disabled={busy || !mfaSetup} type="submit">
              {busy ? t("auth.savingMfa") : t("auth.completeMfaSetup")}
            </button>
            <button
              type="button"
              className="auth-link-button"
              disabled={busy}
              onClick={() => {
                resetRegisterFlow();
                clearMessages();
                setRegisterForm(REGISTER_DEFAULTS);
              }}
            >
              {t("auth.backToRegistration")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
