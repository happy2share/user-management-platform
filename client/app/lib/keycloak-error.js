const KEYCLOAK_ERROR_MESSAGES = {
  invalidPasswordMinLengthMessage: "Password is too short.",
  invalidPasswordMinDigitsMessage: "Password must include more numbers.",
  invalidPasswordMinLowerCaseCharsMessage: "Password must include a lowercase letter.",
  invalidPasswordMinUpperCaseCharsMessage: "Password must include an uppercase letter.",
  invalidPasswordMinSpecialCharsMessage: "Password must include a special character.",
  invalidPasswordNotUsernameMessage: "Password cannot be the same as the username.",
  invalidPasswordRegexPatternMessage: "Password does not meet the required format.",
  invalidPasswordHistoryMessage: "Choose a password you have not used before.",
  userExistsError: "That username is already taken.",
  usernameExistsMessage: "That username is already taken.",
  emailExistsMessage: "That email is already registered.",
};

export function formatKeycloakError(message, fallback = "Something went wrong") {
  if (!message) return fallback;

  const cleanMessage = String(message).trim();
  if (KEYCLOAK_ERROR_MESSAGES[cleanMessage]) {
    return KEYCLOAK_ERROR_MESSAGES[cleanMessage];
  }

  if (cleanMessage.includes("invalidPasswordMinLengthMessage")) {
    const match = cleanMessage.match(/\d+/);
    return match
      ? `Password must be at least ${match[0]} characters.`
      : "Password is too short.";
  }

  return cleanMessage
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export async function getKeycloakError(response, fallback) {
  const text = await response.text();

  if (!text) return fallback;

  try {
    const data = JSON.parse(text);
    return formatKeycloakError(data.errorMessage || data.error, fallback);
  } catch {
    return formatKeycloakError(text, fallback);
  }
}
