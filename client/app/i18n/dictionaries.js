import en from "./LanguageStrings/en";
import hi from "./LanguageStrings/hi";
import te from "./LanguageStrings/te";

export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English", inputLabel: "English" },
  { code: "hi", label: "हिंदी", inputLabel: "Hindi" },
  { code: "te", label: "తెలుగు", inputLabel: "Telugu" },
];

export const DEFAULT_LANGUAGE = "en";

export const dictionaries = { en, hi, te };
