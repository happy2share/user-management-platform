"use client";

import { signOut } from "next-auth/react";

export async function completeLogout() {
  try {
    await fetch("/api/auth/keycloak-logout", { method: "POST" });
  } catch {
    // NextAuth logout below still clears the application session.
  }

  await signOut({ callbackUrl: "/" });
}
