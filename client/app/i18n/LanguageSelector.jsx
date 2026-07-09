"use client";

import { Languages } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export default function LanguageSelector({ variant = "header" }) {
  const { language, languageOptions, setLanguage, t } = useLanguage();

  return (
    <label className={`language-selector language-selector-${variant}`}>
      <span className="language-selector-icon" aria-hidden="true">
        <Languages size={16} strokeWidth={1.8} />
      </span>
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        aria-label={t("common.language")}
      >
        {languageOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
