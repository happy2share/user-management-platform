const SCRIPT_ENTRIES = [
  ["अ", "a"], ["आ", "aa"], ["इ", "i"], ["ई", "ee"], ["उ", "u"], ["ऊ", "oo"], ["ए", "e"], ["ऐ", "ai"], ["ओ", "o"], ["औ", "au"],
  ["क", "ka"], ["ख", "kha"], ["ग", "ga"], ["घ", "gha"], ["च", "cha"], ["छ", "chha"], ["ज", "ja"], ["झ", "jha"], ["ट", "ta"], ["ठ", "tha"], ["ड", "da"], ["ढ", "dha"], ["त", "ta"], ["थ", "tha"], ["द", "da"], ["ध", "dha"], ["न", "na"], ["प", "pa"], ["फ", "pha"], ["ब", "ba"], ["भ", "bha"], ["म", "ma"], ["य", "ya"], ["र", "ra"], ["ल", "la"], ["व", "va"], ["श", "sha"], ["ष", "sha"], ["स", "sa"], ["ह", "ha"], ["क्ष", "ksha"], ["त्र", "tra"], ["ज्ञ", "gya"],
  ["ा", "aa"], ["ि", "i"], ["ी", "ee"], ["ु", "u"], ["ू", "oo"], ["े", "e"], ["ै", "ai"], ["ो", "o"], ["ौ", "au"], ["ं", "m"], ["ः", "h"], ["ँ", "n"], ["्", ""],
  ["అ", "a"], ["ఆ", "aa"], ["ఇ", "i"], ["ఈ", "ee"], ["ఉ", "u"], ["ఊ", "oo"], ["ఎ", "e"], ["ఏ", "e"], ["ఐ", "ai"], ["ఒ", "o"], ["ఓ", "o"], ["ఔ", "au"], ["క", "ka"], ["ఖ", "kha"], ["గ", "ga"], ["ఘ", "gha"], ["చ", "cha"], ["ఛ", "chha"], ["జ", "ja"], ["ఝ", "jha"], ["ట", "ta"], ["ఠ", "tha"], ["డ", "da"], ["ఢ", "dha"], ["ణ", "na"], ["త", "ta"], ["థ", "tha"], ["ద", "da"], ["ధ", "dha"], ["న", "na"], ["ప", "pa"], ["ఫ", "pha"], ["బ", "ba"], ["భ", "bha"], ["మ", "ma"], ["య", "ya"], ["ర", "ra"], ["ల", "la"], ["వ", "va"], ["శ", "sha"], ["ష", "sha"], ["స", "sa"], ["హ", "ha"], ["ళ", "la"], ["ఱ", "ra"], ["ా", "aa"], ["ి", "i"], ["ీ", "ee"], ["ు", "u"], ["ూ", "oo"], ["ె", "e"], ["ే", "e"], ["ై", "ai"], ["ొ", "o"], ["ో", "o"], ["ౌ", "au"], ["ం", "m"], ["ః", "h"], ["్", ""],
  ["அ", "a"], ["ஆ", "aa"], ["இ", "i"], ["ஈ", "ee"], ["உ", "u"], ["ஊ", "oo"], ["எ", "e"], ["ஏ", "e"], ["ஐ", "ai"], ["ஒ", "o"], ["ஓ", "o"], ["ஔ", "au"], ["க", "ka"], ["ங", "nga"], ["ச", "cha"], ["ஞ", "nya"], ["ட", "ta"], ["ண", "na"], ["த", "tha"], ["ந", "na"], ["ப", "pa"], ["ம", "ma"], ["ய", "ya"], ["ர", "ra"], ["ல", "la"], ["வ", "va"], ["ழ", "zha"], ["ள", "la"], ["ற", "ra"], ["ன", "na"], ["ஜ", "ja"], ["ஷ", "sha"], ["ஸ", "sa"], ["ஹ", "ha"], ["ா", "aa"], ["ி", "i"], ["ீ", "ee"], ["ு", "u"], ["ூ", "oo"], ["ெ", "e"], ["ே", "e"], ["ை", "ai"], ["ொ", "o"], ["ோ", "o"], ["ௌ", "au"], ["ம்", "m"], ["்", ""],
  ["ಅ", "a"], ["ಆ", "aa"], ["ಇ", "i"], ["ಈ", "ee"], ["ಉ", "u"], ["ಊ", "oo"], ["ಎ", "e"], ["ಏ", "e"], ["ಐ", "ai"], ["ಒ", "o"], ["ಓ", "o"], ["ಔ", "au"], ["ಕ", "ka"], ["ಖ", "kha"], ["ಗ", "ga"], ["ಘ", "gha"], ["ಚ", "cha"], ["ಛ", "chha"], ["ಜ", "ja"], ["ಝ", "jha"], ["ಟ", "ta"], ["ಠ", "tha"], ["ಡ", "da"], ["ಢ", "dha"], ["ಣ", "na"], ["ತ", "ta"], ["ಥ", "tha"], ["ದ", "da"], ["ಧ", "dha"], ["ನ", "na"], ["ಪ", "pa"], ["ಫ", "pha"], ["ಬ", "ba"], ["ಭ", "bha"], ["ಮ", "ma"], ["ಯ", "ya"], ["ರ", "ra"], ["ಲ", "la"], ["ವ", "va"], ["ಶ", "sha"], ["ಷ", "sha"], ["ಸ", "sa"], ["ಹ", "ha"], ["ಳ", "la"], ["ಾ", "aa"], ["ಿ", "i"], ["ೀ", "ee"], ["ು", "u"], ["ೂ", "oo"], ["ೆ", "e"], ["ೇ", "e"], ["ೈ", "ai"], ["ೊ", "o"], ["ೋ", "o"], ["ೌ", "au"], ["ಂ", "m"], ["ಃ", "h"], ["್", ""],
];

const SCRIPT_MAP = Object.fromEntries(SCRIPT_ENTRIES);

export function normalizeToEnglish(value = "", options = {}) {
  const { username = false, trimUsernameDots = true } = options;
  let text = String(value)
    .split("")
    .map((char) => SCRIPT_MAP[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "");

  if (username) {
    text = text
      .toLowerCase()
      .replace(/\s+/g, ".")
      .replace(/[^a-z0-9._-]/g, "")
      .replace(/\.{2,}/g, ".");

    if (trimUsernameDots) {
      text = text.replace(/^\.+|\.+$/g, "");
    }
  } else {
    text = text.replace(/[^a-zA-Z0-9@._\-\s,/:()&]/g, "").replace(/\s{2,}/g, " ");
  }

  return text;
}

export function normalizeObjectTextFields(payload = {}, keys = []) {
  return keys.reduce((result, key) => {
    if (typeof result[key] === "string") {
      result[key] = normalizeToEnglish(result[key], { username: key === "username" });
    }
    return result;
  }, { ...payload });
}
