"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./activation.css";

const STEP_ORDER = ["start", "terms", "password", "email", "mfa", "complete"];
const STEP_LABELS = {
  terms: "Terms",
  password: "Password",
  email: "Email",
  mfa: "MFA",
  complete: "Done",
};

function pathFor(step, token) {
  const suffix = step === "start" ? "/activate" : `/activate/${step}`;
  return `${suffix}?token=${encodeURIComponent(token)}`;
}

function nextPath(currentStep, token, nextStep) {
  if (nextStep && nextStep !== currentStep) {
    return pathFor(nextStep, token);
  }

  const index = STEP_ORDER.indexOf(currentStep);
  return pathFor(STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)], token);
}

function StepProgress({ completed, activeStep }) {
  return (
    <div className="activation-steps">
      {["terms", "password", "email", "mfa", "complete"].map((item) => (
        <div
          key={item}
          className={`activation-step-pill ${completed[item] ? "done" : ""} ${activeStep === item ? "active" : ""}`}
        >
          {STEP_LABELS[item]}
        </div>
      ))}
    </div>
  );
}

function StatusBlock({ status }) {
  if (!status) return null;
  return (
    <div className="activation-alert info">
      Account: <strong>{status.username}</strong> {status.email ? `(${status.email})` : ""}
    </div>
  );
}

export default function ActivationStep({ step, initialToken = "", initialEmailToken = "" }) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken || "");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });
  const [emailToken, setEmailToken] = useState(initialEmailToken || "");
  const [verifyLink, setVerifyLink] = useState("");
  const [mfaSetup, setMfaSetup] = useState(null);
  const [otp, setOtp] = useState("");

  const activeStep = step === "start" && status?.nextStep ? status.nextStep : step;

  const completed = useMemo(() => status?.completed || {}, [status]);

  async function loadStatus(targetToken = token) {
    if (!targetToken) return null;
    const response = await fetch(`/api/activation/status?token=${encodeURIComponent(targetToken)}`, {
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to load activation status");
    setStatus(data);
    return data;
  }

  useEffect(() => {
    if (!initialToken) return;
    const timeoutId = window.setTimeout(() => {
      loadStatus(initialToken).catch((err) => setError(err.message));
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  useEffect(() => {
    if (step === "email" && initialEmailToken) {
      verifyEmail(initialEmailToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, initialEmailToken]);

  async function startActivation(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const data = await loadStatus(token);
      router.push(pathFor(data.nextStep || "terms", token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid activation link");
    } finally {
      setBusy(false);
    }
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function acceptTerms(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await postJson("/api/activation/terms", { token, accepted: termsAccepted });
      const data = await loadStatus(token);
      router.push(nextPath("terms", token, data.nextStep));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept terms");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await postJson("/api/activation/password", { token, ...passwordForm });
      setPasswordForm({ password: "", confirmPassword: "" });
      const data = await loadStatus(token);
      router.push(nextPath("password", token, data.nextStep));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail(event) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await postJson("/api/activation/email/send", { token });
      setVerifyLink(data.verifyLink || "");
      setEmailToken(data.emailToken || "");
      setMessage(`Verification link generated for ${data.email || "the user"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate email verification link");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail(targetEmailToken = emailToken) {
    setBusy(true);
    setError("");
    try {
      await postJson("/api/activation/email/verify", { emailToken: targetEmailToken });
      const data = await loadStatus(token);
      setMessage("Email verified successfully.");
      router.push(nextPath("email", token, data.nextStep));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify email");
    } finally {
      setBusy(false);
    }
  }

  async function setupMfa(event) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await postJson("/api/activation/mfa/setup", { token });
      setMfaSetup(data);
      setMessage("Authenticator setup generated by Keycloak.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start MFA setup");
    } finally {
      setBusy(false);
    }
  }

  async function verifyMfa(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await postJson("/api/activation/mfa/verify", { token, otp });
      const data = await loadStatus(token);
      router.push(nextPath("mfa", token, data.nextStep));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify MFA");
    } finally {
      setBusy(false);
    }
  }

  async function completeActivation(event) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await postJson("/api/activation/complete", { token });
      setMessage("Activation completed. You can now login.");
      window.setTimeout(() => router.push("/"), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation is not complete yet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="activation-shell">
      <section className="activation-card">
        <div className="activation-brand">
          <div className="activation-mark" />
          <div>
            <p className="activation-eyebrow">IAM Portal Activation</p>
            <h1 className="activation-title">Complete account setup</h1>
          </div>
        </div>

        <p className="activation-subtitle">
          New users must complete required actions before normal login: accept terms,
          update password, verify email, and configure MFA.
        </p>

        <StepProgress completed={completed} activeStep={activeStep} />
        <StatusBlock status={status} />

        {error && <div className="activation-alert error">{error}</div>}
        {message && <div className="activation-alert success">{message}</div>}

        {step === "start" && (
          <form className="activation-form" onSubmit={startActivation}>
            <label>
              Activation token
              <textarea
                value={token}
                onChange={(event) => setToken(event.target.value.trim())}
                placeholder="Paste the activation token or use the full activation link generated after user creation"
                required
              />
            </label>
            <div className="activation-actions">
              <button className="activation-button" disabled={busy} type="submit">
                {busy ? "Checking..." : "Start activation"}
              </button>
              <Link className="activation-button secondary" href="/">
                Back to login
              </Link>
            </div>
          </form>
        )}

        {step === "terms" && (
          <form className="activation-form" onSubmit={acceptTerms}>
            <div className="activation-terms">
              <h3>Terms and Conditions</h3>
              <p>
                By using this IAM Portal, you agree to follow your organization&apos;s access,
                password, MFA, and account usage policies. You are responsible for keeping
                your credentials private and reporting suspicious access immediately.
              </p>
              <p>
                This acceptance is stored against your Keycloak user as portal onboarding
                evidence before the Keycloak required action is removed.
              </p>
            </div>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  style={{ width: "auto", minHeight: "auto", marginRight: 8 }}
                />
                I accept the Terms and Conditions
              </span>
            </label>
            <button className="activation-button" disabled={busy || !termsAccepted} type="submit">
              {busy ? "Saving..." : "Accept and continue"}
            </button>
          </form>
        )}

        {step === "password" && (
          <form className="activation-form" onSubmit={updatePassword}>
            <label>
              New password
              <input
                type="password"
                value={passwordForm.password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                required
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                required
              />
            </label>
            <p className="activation-note">
              The password is sent to the Next.js server route and stored in Keycloak
              using the Admin REST reset-password endpoint with temporary=false.
            </p>
            <button className="activation-button" disabled={busy} type="submit">
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>
        )}

        {step === "email" && (
          <form className="activation-form" onSubmit={sendEmail}>
            <p className="activation-note">
              Development mode generates a verification link. In production, connect this
              route to SMTP and email the link to the user.
            </p>
            <div className="activation-actions">
              <button className="activation-button" disabled={busy} type="submit">
                {busy ? "Generating..." : "Generate verification link"}
              </button>
              {emailToken && (
                <button
                  className="activation-button secondary"
                  disabled={busy}
                  type="button"
                  onClick={() => verifyEmail(emailToken)}
                >
                  Verify now
                </button>
              )}
            </div>
            {verifyLink && (
              <label>
                Local development verification link
                <textarea readOnly value={verifyLink} />
              </label>
            )}
          </form>
        )}

        {step === "mfa" && (
          <form className="activation-form" onSubmit={verifyMfa}>
            {!mfaSetup ? (
              <>
                <p className="activation-note">
                  This step calls the Keycloak onboarding SPI. The SPI generates a TOTP
                  secret and stores the final OTP credential inside Keycloak after the
                  user enters a valid code.
                </p>
                <button className="activation-button" disabled={busy} type="button" onClick={setupMfa}>
                  {busy ? "Starting..." : "Start MFA setup"}
                </button>
              </>
            ) : (
              <>
                <div className="activation-secret">
                  <span>Manual setup key</span>
                  <code>{mfaSetup.secret}</code>
                  {mfaSetup.otpauthUri && (
                    <textarea readOnly value={mfaSetup.otpauthUri} aria-label="OTP Auth URI" />
                  )}
                  {mfaSetup.qrSvg && (
                    <div dangerouslySetInnerHTML={{ __html: mfaSetup.qrSvg }} />
                  )}
                </div>
                <p className="activation-note">
                  Scan the QR if provided by the SPI, or manually enter the setup key in
                  Google Authenticator / Microsoft Authenticator.
                </p>
                <label>
                  OTP code
                  <input
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                    placeholder="Enter 6-digit code"
                    inputMode="numeric"
                    required
                  />
                </label>
                <button className="activation-button" disabled={busy} type="submit">
                  {busy ? "Verifying..." : "Verify and save MFA"}
                </button>
              </>
            )}
          </form>
        )}

        {step === "complete" && (
          <form className="activation-form" onSubmit={completeActivation}>
            <p className="activation-note">
              Final check confirms every required action is completed in Keycloak and
              then marks onboardingStatus=COMPLETED.
            </p>
            <button className="activation-button" disabled={busy} type="submit">
              {busy ? "Completing..." : "Finish activation"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
