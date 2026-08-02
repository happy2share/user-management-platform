"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import LanguageSelector from "../../i18n/LanguageSelector";
import { useLanguage } from "../../i18n/LanguageProvider";
import { normalizeToEnglish } from "../../i18n/english-normalizer";
import { roleTarget } from "../../lib/role-target";
import { readApiResponse } from "../../lib/api-response";
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
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");

  const roles = useMemo(() => session?.roles ?? [], [session]);

  useEffect(() => {
    if (status === "authenticated") {
      if (session?.needsUsername) {
        router.replace("/choose-username");
        return;
      }
      router.replace(roleTarget(roles));
    }
  }, [roles, router, session?.needsUsername, status]);

  function resetLoginStep() {
    setLoginStep("password");
    setOtp("");
    setMfaSetup(null);
    setMfaSetupOtp("");
    setForgotIdentifier("");
    setForgotOtp("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setShowForgotNewPassword(false);
    setShowForgotConfirmPassword(false);
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

  function handleBackToLogin() {
    resetLoginStep();
    clearMessages();
  }

  function updateLogin(field, value) {
    setLoginForm((current) => ({
      ...current,
      [field]:
        field === "username"
          ? normalizeToEnglish(value, { username: true, trimUsernameDots: false })
          : value,
    }));
  }

  function updateRegister(field, value) {
    setRegisterForm((current) => ({
      ...current,
      [field]:
        field === "username"
          ? normalizeToEnglish(value, { username: true, trimUsernameDots: false })
          : value,
    }));
  }

  async function handleForgotPasswordStart(event) {
    event.preventDefault();
    setBusy(true);
    clearMessages();

    const identifier = forgotIdentifier.trim();
    if (!identifier) {
      setBusy(false);
      setError(t("auth.enterUsernameOrEmail"));
      return;
    }

    try {
      const { response, data } = await postJson("/api/public/forgot-password", {
        identifier,
      });
      setBusy(false);

      if (!response.ok) {
        setError(data.error || t("auth.failedSendResetCode"));
        return;
      }

      if (data.localOtpCode) setLocalOtpCode(data.localOtpCode);
      setMessage(t("auth.resetCodeSent"));
      setLoginStep("forgot-otp");
    } catch {
      setBusy(false);
      setError(t("auth.failedSendResetCode"));
    }
  }

  async function handleForgotPasswordVerifyOtp(event) {
    event.preventDefault();
    setBusy(true);
    clearMessages();

    if (!forgotOtp.trim() || !/^\d{6}$/.test(forgotOtp.trim())) {
      setBusy(false);
      setError(t("auth.enterSixDigitCode"));
      return;
    }

    setBusy(false);
    setMessage("");
    setLoginStep("forgot-new-password");
  }

  async function handleForgotPasswordReset(event) {
    event.preventDefault();
    setBusy(true);
    clearMessages();

    if (forgotNewPassword !== forgotConfirmPassword) {
      setBusy(false);
      setError(t("auth.passwordsMismatch"));
      return;
    }

    try {
      const { response, data } = await postJson("/api/public/reset-password", {
        identifier: forgotIdentifier.trim(),
        otp: forgotOtp.trim(),
        newPassword: forgotNewPassword,
      });
      setBusy(false);

      if (!response.ok) {
        setError(data.error || t("auth.passwordResetFailed"));
        return;
      }

      setMessage(t("auth.passwordResetSuccess"));
      resetLoginStep();
      setLoginForm({ username: forgotIdentifier.trim(), password: "" });
    } catch {
      setBusy(false);
      setError(t("auth.passwordResetFailed"));
    }
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await readApiResponse(response);
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

  async function handleGoogleLogin() {
    setBusy(true);
    clearMessages();

    try {
      const statusResponse = await fetch("/api/auth/sso-status", {
        cache: "no-store",
      });
      const statusData = await readApiResponse(statusResponse);

      if (!statusData.googleConfigured) {
        setBusy(false);
        setError(
          "Google SSO is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart the app.",
        );
        return;
      }

      await signIn(
        "google",
        { callbackUrl: "/" },
        { prompt: "select_account" },
      );
    } catch {
      setBusy(false);
      setError("Failed to start Google SSO. Check the server logs and Google OAuth configuration.");
    }
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

  const continueRegisterMfaSetup = useCallback(async (username, password) => {
    setLoginForm({ username, password });
    setEmailOtp("");

    const setup = await postJson("/api/public/mfa/setup", { username, password });
    setBusy(false);

    if (!setup.response.ok) {
      setError(setup.data.error || t("auth.failedStartMfa"));
      return;
    }

    setMfaSetup(setup.data);
    setRegisterStep("mfa");
    setMessage(t("auth.emailVerifiedSetupMfa"));
  }, [t]);

  const checkRegisterEmailVerified = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");

    const username = registerForm.username.trim();
    const password = registerForm.password;
    const { response, data } = await postJson("/api/public/password-check", {
      username,
      password,
    });

    if (!response.ok || data.status !== "MFA_SETUP_REQUIRED") {
      setBusy(false);
      return false;
    }

    await continueRegisterMfaSetup(username, password);
    return true;
  }, [continueRegisterMfaSetup, registerForm.password, registerForm.username]);

  async function handleRegisterEmailVerify(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const username = registerForm.username.trim();
    const password = registerForm.password;

    if (!emailOtp.trim()) {
      const alreadyVerified = await checkRegisterEmailVerified();
      if (!alreadyVerified) {
        setError(t("auth.enterSixDigitCode"));
      }
      return;
    }

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

    await continueRegisterMfaSetup(username, password);
  }

  useEffect(() => {
    if (mode !== "register" || registerStep !== "email" || busy) return undefined;

    async function handleWindowFocus() {
      await checkRegisterEmailVerified();
    }

    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [busy, checkRegisterEmailVerified, mode, registerStep]);

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
            <>
              <button
                type="button"
                className="auth-google"
                disabled={busy}
                onClick={handleGoogleLogin}
              >
                <span className="auth-google-mark" aria-hidden="true">G</span>
                {t("auth.continueWithGoogle")}
              </button>
              <div className="auth-divider">
                <span>{t("auth.orLoginWithPassword")}</span>
              </div>
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
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() => {
                    clearMessages();
                    setLoginStep("forgot-identifier");
                    setForgotIdentifier(loginForm.username || "");
                  }}
                >
                  {t("auth.forgotPassword")}
                </button>
              </form>
            </>
          ) : loginStep === "forgot-identifier" ? (
            <form onSubmit={handleForgotPasswordStart} className="auth-form">
              <p className="auth-step-title">{t("auth.forgotPasswordTitle")}</p>
              <label>
                <span>{t("auth.enterUsernameOrEmail")} <RequiredMark /></span>
                <input
                  name="forgotIdentifier"
                  value={forgotIdentifier}
                  onChange={(event) =>
                    setForgotIdentifier(
                      normalizeToEnglish(event.target.value, {
                        username: true,
                        trimUsernameDots: false,
                      }),
                    )
                  }
                  placeholder={t("auth.enterUsernameOrEmail")}
                  autoFocus
                  required
                />
              </label>
              <button className="auth-submit" disabled={busy} type="submit">
                {busy ? t("auth.sendingCode") : t("auth.sendResetCode")}
              </button>
              <button
                type="button"
                className="auth-link-button"
                disabled={busy}
                onClick={handleBackToLogin}
              >
                {t("auth.backToLogin")}
              </button>
            </form>
          ) : loginStep === "forgot-otp" ? (
            <form onSubmit={handleForgotPasswordVerifyOtp} className="auth-form">
              <p className="auth-step-title">{t("auth.forgotPasswordTitle")}</p>
              <label>
                <span>{t("auth.emailOtp")} <RequiredMark /></span>
                <input
                  name="forgotOtp"
                  value={forgotOtp}
                  onChange={(event) =>
                    setForgotOtp(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder={t("auth.enterResetOtp")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  required
                />
              </label>
              <button className="auth-submit" disabled={busy} type="submit">
                {busy ? t("auth.verifying") : t("auth.verifyAndContinue")}
              </button>
              <button
                type="button"
                className="auth-link-button"
                disabled={busy}
                onClick={handleBackToLogin}
              >
                {t("auth.backToLogin")}
              </button>
            </form>
          ) : loginStep === "forgot-new-password" ? (
            <form onSubmit={handleForgotPasswordReset} className="auth-form">
              <p className="auth-step-title">{t("auth.forgotPasswordTitle")}</p>
              <label>
                <span>{t("auth.newPassword")} <RequiredMark /></span>
                <span className="auth-password-field">
                  <input
                    name="forgotNewPassword"
                    type={showForgotNewPassword ? "text" : "password"}
                    value={forgotNewPassword}
                    onChange={(event) =>
                      setForgotNewPassword(event.target.value)
                    }
                    placeholder={t("auth.newPassword")}
                    autoFocus
                    required
                  />
                  <PasswordVisibilityToggle
                    visible={showForgotNewPassword}
                    onToggle={() => setShowForgotNewPassword((c) => !c)}
                    showLabel={t("common.show")}
                    hideLabel={t("common.hide")}
                  />
                </span>
              </label>
              <label>
                <span>{t("auth.confirmNewPassword")} <RequiredMark /></span>
                <span className="auth-password-field">
                  <input
                    name="forgotConfirmPassword"
                    type={showForgotConfirmPassword ? "text" : "password"}
                    value={forgotConfirmPassword}
                    onChange={(event) =>
                      setForgotConfirmPassword(event.target.value)
                    }
                    placeholder={t("auth.confirmNewPassword")}
                    required
                  />
                  <PasswordVisibilityToggle
                    visible={showForgotConfirmPassword}
                    onToggle={() => setShowForgotConfirmPassword((c) => !c)}
                    showLabel={t("common.show")}
                    hideLabel={t("common.hide")}
                  />
                </span>
              </label>
              <button className="auth-submit" disabled={busy} type="submit">
                {busy ? t("auth.resettingPassword") : t("auth.resetPassword")}
              </button>
              <button
                type="button"
                className="auth-link-button"
                disabled={busy}
                onClick={handleBackToLogin}
              >
                {t("auth.backToLogin")}
              </button>
            </form>
          ) : loginStep === "mfa-setup" ? (
            <form onSubmit={handleMfaSetupVerify} className="auth-form">
              {!mfaSetup ? (
                <button
                  className="auth-submit"
                  disabled={busy}
                  type="button"
                  onClick={() => handleMfaSetupStart()}
                >
                  {busy ? t("auth.preparingMfa") : t("auth.generateMfaQr")}
                </button>
              ) : (
                <>
                  <div className="auth-qr-box">
                    {/* eslint-disable-next-line @next/next/no-img-element -- QR code is generated as a data URL by the local MFA setup flow. */}
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
              className="auth-secondary"
              disabled={busy}
              onClick={checkRegisterEmailVerified}
            >
              {busy ? t("auth.verifying") : "I verified from email"}
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
                {/* eslint-disable-next-line @next/next/no-img-element -- QR code is generated as a data URL by the local MFA setup flow. */}
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
