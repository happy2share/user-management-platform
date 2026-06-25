"use client";

import { SessionProvider } from "next-auth/react";
import { LanguageProvider } from "../i18n/LanguageProvider";

export default function SessionProviderWrapper({ children }) {
  return (
    <SessionProvider>
      <LanguageProvider>{children}</LanguageProvider>
    </SessionProvider>
  );
}
