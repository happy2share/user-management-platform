"use client";

import { signOut } from "next-auth/react";

export async function completeLogout(session) {
  const idToken = session?.idToken;

  try {
    await fetch("/api/auth/keycloak-logout", { method: "POST" });
  } catch {
    // Browser logout below still clears the application session.
  }

  await signOut({ redirect: false });

  const issuer = process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER;

  if (issuer && idToken) {
    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: window.location.origin,
    });

    window.location.href = `${issuer}/protocol/openid-connect/logout?${params.toString()}`;
    return;
  }

  window.location.href = "/";
}
