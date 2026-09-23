const CROATIAN =
  /[čćđšž]|(?<![\p{L}])(?:danas|sutra|kako|što|sto|šta|sta|gdje|tko|zašto|zasto|molim|hvala|trebam|moram|želim|zelim|hoću|hocu|neću|necu|koji|koja|koje|bicikl|popravim|imam|ispit|sati|prvog|drugog|desetog|devet|dvadeset|trideset)(?![\p{L}])/iu;

const CYRILLIC: Record<string, string> = {
  љ: "lj",
  њ: "nj",
  џ: "dž",
  ђ: "đ",
  ћ: "ć",
  ж: "ž",
  ш: "š",
  ч: "č",
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  з: "z",
  и: "i",
  ј: "j",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
};

export type SpeechLanguage = "hr" | "en";

function lettersOf(text: string) {
  return [...text].filter((char) => /\p{L}/u.test(char));
}

function mostlyNonLatin(text: string) {
  const letters = lettersOf(text);
  if (letters.length === 0) return false;
  const nonLatin = letters.filter((char) => !/\p{Script=Latin}/u.test(char)).length;
  return nonLatin > letters.length / 2;
}

function hasNonLatinLetter(text: string) {
  return lettersOf(text).some((char) => !/\p{Script=Latin}/u.test(char));
}

function foldCyrillic(text: string) {
  const pairs = Object.entries(CYRILLIC).sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [from, to] of pairs) {
    out = out.replaceAll(from, to);
    out = out.replaceAll(from.toUpperCase(), to.charAt(0).toUpperCase() + to.slice(1));
  }
  return out;
}

function languageOf(text: string): SpeechLanguage {
  return CROATIAN.test(text) ? "hr" : "en";
}

/**
 * Latin Croatian or English is kept. Serbian/Croatian Cyrillic is rewritten to
 * Latin and kept, including date and time phrases that have no marker words.
 * A script that does not fold completely into Latin is dropped.
 */
export function acceptSpeech(text: string): { text: string; language: SpeechLanguage } | null {
  const value = text.trim();
  if (!value) return null;
  if (!mostlyNonLatin(value)) return { text: value, language: languageOf(value) };
  const latin = foldCyrillic(value);
  if (latin === value || hasNonLatinLetter(latin)) return null;
  return { text: latin, language: "hr" };
}

export function browserSpeechLang() {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("hr")) {
    return "hr-HR";
  }
  return "en-US";
}
