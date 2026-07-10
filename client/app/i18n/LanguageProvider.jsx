"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { readApiResponse } from "../lib/api-response";
import {
  DEFAULT_LANGUAGE,
  dictionaries,
  LANGUAGE_OPTIONS,
} from "./dictionaries";

const STORAGE_KEY = "iam_portal_language";

const LanguageContext = createContext(null);

function getStoredLanguage() {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return dictionaries[stored] ? stored : DEFAULT_LANGUAGE;
}

function readPath(source, path) {
  return path.split(".").reduce((current, key) => current?.[key], source);
}

export function LanguageProvider({ children }) {
  const { status } = useSession();
  const [language, setLanguageState] = useState(getStoredLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    async function syncLocaleFromKeycloak() {
      try {
        const response = await fetch("/api/me/locale", { cache: "no-store" });
        const data = await readApiResponse(response);

        if (cancelled || !response.ok) return;

        if (dictionaries[data.locale]) {
          setLanguageState(data.locale);
          return;
        }

        if (language !== DEFAULT_LANGUAGE) {
          await fetch("/api/me/locale", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale: language }),
          });
        }
      } catch {
        // The local browser preference still works if Keycloak is unreachable.
      }
    }

    syncLocaleFromKeycloak();

    return () => {
      cancelled = true;
    };
  }, [language, status]);

  const value = useMemo(() => {
    const dictionary = dictionaries[language] || dictionaries[DEFAULT_LANGUAGE];

    function setLanguage(nextLanguage) {
      if (dictionaries[nextLanguage]) {
        setLanguageState(nextLanguage);

        if (status === "authenticated") {
          fetch("/api/me/locale", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale: nextLanguage }),
          }).catch(() => {
            // Keep the local selection even if server persistence fails.
          });
        }
      }
    }

    function t(path, params = {}) {
      const template =
        readPath(dictionary, path) ??
        readPath(dictionaries[DEFAULT_LANGUAGE], path) ??
        path;

      if (typeof template !== "string") return template;

      return template.replace(/\{(\w+)\}/g, (_, key) =>
        params[key] === undefined || params[key] === null
          ? ""
          : String(params[key]),
      );
    }

    return {
      language,
      languageOptions: LANGUAGE_OPTIONS,
      setLanguage,
      t,
    };
  }, [language, status]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }

  return context;
}
