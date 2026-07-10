export function humanizeKey(value) {
  return String(value || "")
    .replace(/^\$\{(.+)\}$/, "$1")
    .replace(/^(role|client)_/, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function cleanDisplayText(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;

  const text = String(value).trim();
  if (!text) return fallback;

  const tokenMatch = text.match(/^\$\{([^}]+)\}$/);
  if (tokenMatch?.[1]) return humanizeKey(tokenMatch[1]);

  return text;
}
