"use client";

import { useEffect } from "react";
import { useLanguage } from "./LanguageProvider";
import { normalizeToEnglish } from "./english-normalizer";

const SCRIPT_TESTS = {
  en: /[A-Za-z]/u,
  hi: /[\u0900-\u097F]/u,
  te: /[\u0C00-\u0C7F]/u,
};

const NEUTRAL_TEXT = /[\d\s@._\-+,/:()&]/u;

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
}

function getScript(char) {
  for (const [script, pattern] of Object.entries(SCRIPT_TESTS)) {
    if (pattern.test(char)) return script;
  }

  return null;
}

function isNeutralChar(char) {
  return NEUTRAL_TEXT.test(char);
}

function filterToLanguage(value, language) {
  let changed = false;
  let seenScript = null;

  const filtered = Array.from(String(value))
    .filter((char) => {
      const script = getScript(char);

      if (!script) {
        if (isNeutralChar(char)) return true;
        changed = true;
        return false;
      }

      if (!seenScript) seenScript = script;

      if (script !== language || script !== seenScript) {
        changed = true;
        return false;
      }

      return true;
    })
    .join("");

  return { changed, value: filtered };
}

function isUsernameField(target) {
  const name = target.name?.toLowerCase() || "";
  const id = target.id?.toLowerCase() || "";
  return name.includes("username") || id.includes("username");
}

function shouldForceEnglish(target) {
  const type = target.getAttribute("type") || "text";
  return type === "email" || type === "url" || isUsernameField(target);
}

export default function EnglishInputGuard() {
  const { language, t } = useLanguage();

  useEffect(() => {
    function normalizeTarget(target) {
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
        return;
      }

      const type = target.getAttribute("type") || "text";
      const checkedTypes = ["text", "search", "email", "url", "tel", ""];

      if (!checkedTypes.includes(type) || target.dataset.allowNonEnglish === "true") {
        return;
      }

      let nextValue = target.value;
      let changed = false;

      if (shouldForceEnglish(target)) {
        const normalized = normalizeToEnglish(target.value, {
          username: isUsernameField(target),
          trimUsernameDots: false,
        });
        changed = normalized !== target.value;
        nextValue = normalized;
      } else {
        const result = filterToLanguage(target.value, language);
        changed = result.changed;
        nextValue = result.value;
      }

      if (changed) {
        setNativeValue(target, nextValue);
        target.setCustomValidity(t("inputGuard.mixedLanguage"));
        target.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        target.setCustomValidity("");
      }
    }

    function onInput(event) {
      normalizeTarget(event.target);
    }

    function onBlur(event) {
      normalizeTarget(event.target);
      event.target?.setCustomValidity?.("");
    }

    document.addEventListener("input", onInput, true);
    document.addEventListener("blur", onBlur, true);

    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("blur", onBlur, true);
    };
  }, [language, t]);

  return null;
}
