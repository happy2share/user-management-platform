"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { roleTarget } from "../lib/role-target";
import { readApiResponse } from "../lib/api-response";
import "./username.css";

export default function ChooseUsernamePage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status === "authenticated" && !session?.needsUsername) {
      router.replace(roleTarget(session?.roles ?? []));
    }
  }, [router, session, status]);

  function updateUsername(value) {
    setUsername(
      value
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 32),
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const response = await fetch("/api/me/username", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, username }),
    });
    const data = await readApiResponse(response);

    if (!response.ok) {
      setBusy(false);
      setError(data.error || "Failed to save username");
      return;
    }

    await update({ needsUsername: false });
    router.replace(roleTarget(session?.roles ?? []));
    router.refresh();
  }

  if (status === "loading") {
    return (
      <main className="username-shell">
        <section className="username-card">Checking session...</section>
      </main>
    );
  }

  return (
    <main className="username-shell">
      <section className="username-card">
        <div className="username-header">
          <div className="username-logo" aria-hidden="true" />
          <div>
            <h1>Complete your profile</h1>
            <p>These details will be saved to your Keycloak account.</p>
          </div>
        </div>

        {error && <div className="username-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="username-form">
          <div className="username-two-col">
            <label>
              <span>First name</span>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First name"
                maxLength={80}
                autoFocus
                required
              />
            </label>
            <label>
              <span>Last name</span>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last name"
                maxLength={80}
                required
              />
            </label>
          </div>
          <label>
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => updateUsername(event.target.value)}
              placeholder="for example: arjun.service"
              minLength={3}
              maxLength={32}
              required
            />
          </label>
          <p className="username-hint">
            Use 3-32 lowercase letters, numbers, dot, underscore, or hyphen.
          </p>
          <button
            type="submit"
            disabled={
              busy ||
              username.length < 3 ||
              !firstName.trim() ||
              !lastName.trim()
            }
          >
            {busy ? "Saving..." : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
