const ROLE_LABELS = {
  "realm-admin": {
    en: "Realm Admin",
    hi: "रीयल्म एडमिन",
    te: "రీయల్మ్ అడ్మిన్",
  },
  "app-admin": {
    en: "Application Admin",
    hi: "एप्लिकेशन एडमिन",
    te: "అప్లికేషన్ అడ్మిన్",
  },
  "app-supervisor": {
    en: "Application Supervisor",
    hi: "एप्लिकेशन सुपरवाइज़र",
    te: "అప్లికేషన్ సూపర్వైజర్",
  },
  "app-user": {
    en: "Application User",
    hi: "एप्लिकेशन उपयोगकर्ता",
    te: "అప్లికేషన్ వినియోగదారు",
  },
};

export function getRoleLabel(roleName, language = "en") {
  if (!roleName) return "";

  const labels = ROLE_LABELS[roleName];
  return labels?.[language] || labels?.en || roleName;
}

export function hasRoleLabel(roleName) {
  return Boolean(ROLE_LABELS[roleName]);
}
