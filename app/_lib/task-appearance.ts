export const TASK_ICONS = [
  { id: "target", label: "Target", keywords: ["goal", "objective", "cilj", "milestone"] },
  { id: "rocket", label: "Launch", keywords: ["launch", "ship", "deploy", "release", "objavi"] },
  { id: "code", label: "Code", keywords: ["code", "kod", "program", "developer", "api", "hud"] },
  { id: "bug", label: "Bug", keywords: ["bug", "greska", "greška", "defect"] },
  { id: "mail", label: "Mail", keywords: ["email", "e-mail", "gmail", "inbox", "mail"] },
  { id: "calendar", label: "Calendar", keywords: ["meeting", "sastanak", "appointment", "schedule", "calendar", "kalendar"] },
  { id: "phone", label: "Phone", keywords: ["call", "phone", "nazvati", "nazovi", "telefon"] },
  { id: "cart", label: "Shopping", keywords: ["buy", "shop", "kupiti", "grocery", "trgovina", "namirnice", "kupovina", "ducan", "dućan"] },
  { id: "home", label: "Home", keywords: ["home", "house", "clean", "cistiti", "čistiti", "kuca", "kuća", "stan"] },
  { id: "heart", label: "Health", keywords: ["health", "zdravlje", "medicina", "lijek", "lek"] },
  { id: "stethoscope", label: "Clinic", keywords: ["doctor", "doktor", "dentist", "zubar", "lijecnik", "liječnik", "ordinacija"] },
  { id: "book", label: "Study", keywords: ["read", "study", "uciti", "učiti", "knjiga", "book", "research", "citati", "čitati"] },
  { id: "pen", label: "Draft", keywords: ["write", "design", "review", "nacrt", "napisi", "napiši", "draft", "skica"] },
  { id: "users", label: "Team", keywords: ["standup", "team", "sync", "ekipa", "tim"] },
  { id: "briefcase", label: "Work", keywords: ["office", "posao", "client", "klijent", "brief"] },
  { id: "zap", label: "Focus", keywords: ["deep work", "focus", "sprint", "fokus"] },
  { id: "flag", label: "Flag", keywords: ["deadline", "rok", "flag"] },
  { id: "coffee", label: "Coffee", keywords: ["coffee", "kava", "cafe"] },
  { id: "car", label: "Drive", keywords: ["drive", "car", "auto", "voznja", "vožnja", "parking"] },
  { id: "plane", label: "Travel", keywords: ["flight", "travel", "putovanje", "avion", "airport", "zracna", "zračna"] },
  { id: "music", label: "Music", keywords: ["music", "glazba", "song", "pjesma"] },
  { id: "camera", label: "Photo", keywords: ["photo", "camera", "slikati", "fotograf"] },
  { id: "dumbbell", label: "Training", keywords: ["workout", "gym", "trening", "teretana", "exercise", "vjezba", "vježba"] },
  { id: "leaf", label: "Garden", keywords: ["plant", "garden", "vrt", "biljka"] },
  { id: "shield", label: "Security", keywords: ["security", "password", "lozinka", "backup"] },
  { id: "wrench", label: "Repair", keywords: ["repair", "popraviti", "popravak", "maintenance", "servis"] },
  { id: "spark", label: "Idea", keywords: ["idea", "brainstorm", "ideja"] },
  { id: "message", label: "Message", keywords: ["message", "slack", "poruka", "sms"] },
  { id: "file", label: "Document", keywords: ["document", "report", "dokument", "izvjestaj", "izvještaj", "file"] },
  { id: "wallet", label: "Payment", keywords: ["pay", "invoice", "platiti", "racun", "račun", "bank", "money", "uplata"] },
  { id: "mic", label: "Voice", keywords: ["voice", "speech", "podcast", "snimi", "mikrofon"] },
  { id: "utensils", label: "Meal", keywords: ["cook", "lunch", "dinner", "rucak", "ručak", "vecera", "večera", "kuhati", "food", "jesti"] },
] as const;

export const TASK_COLORS = [
  { id: "cyan", label: "Cyan", hex: "#00d4ff", keywords: ["code", "kod", "jarvis", "system", "api", "voice", "speech"] },
  { id: "amber", label: "Amber", hex: "#f5c542", keywords: ["meeting", "sastanak", "review", "deadline", "standup", "rok"] },
  { id: "mint", label: "Mint", hex: "#3dffb0", keywords: ["health", "zdravlje", "workout", "trening", "teretana", "gym", "habit"] },
  { id: "rose", label: "Rose", hex: "#ff5d73", keywords: ["urgent", "critical", "bug", "danger", "hitno", "greska", "greška"] },
  { id: "violet", label: "Violet", hex: "#b388ff", keywords: ["design", "creative", "idea", "ideja", "nacrt", "skica"] },
  { id: "orange", label: "Orange", hex: "#ff8a3d", keywords: ["shop", "buy", "kupiti", "errand", "grocery", "namirnice", "ducan", "dućan"] },
  { id: "sky", label: "Sky", hex: "#7ecbff", keywords: ["travel", "flight", "putovanje", "trip", "avion"] },
  { id: "lime", label: "Lime", hex: "#c6f54a", keywords: ["home", "garden", "clean", "vrt", "kuca", "kuća"] },
  { id: "pink", label: "Pink", hex: "#ff7ad9", keywords: ["birthday", "rodendan", "rođendan", "gift", "poklon"] },
  { id: "gold", label: "Gold", hex: "#e8c872", keywords: ["pay", "invoice", "platiti", "racun", "račun", "money", "bank"] },
] as const;

export type TaskIconId = (typeof TASK_ICONS)[number]["id"];
export type TaskColorId = (typeof TASK_COLORS)[number]["id"];

export const TASK_ICON_IDS: TaskIconId[] = TASK_ICONS.map((item) => item.id);
export const TASK_COLOR_IDS: TaskColorId[] = TASK_COLORS.map((item) => item.id);

export function taskAppearanceGuide() {
  return `Icons: ${TASK_ICON_IDS.join(", ")}. Colors: ${TASK_COLOR_IDS.join(", ")}.`;
}

export function taskSwatch(id: TaskColorId) {
  return TASK_COLORS.find((item) => item.id === id) ?? TASK_COLORS[0];
}

export function resolveTaskAppearance(input: {
  title: string;
  icon?: string | null;
  color?: string | null;
}): { icon: TaskIconId; color: TaskColorId } {
  return {
    icon: matchChoice(input.icon, TASK_ICONS) ?? inferChoice(input.title, TASK_ICONS),
    color: matchChoice(input.color, TASK_COLORS) ?? inferChoice(input.title, TASK_COLORS),
  };
}

function matchChoice<T extends { id: string; label: string }>(
  value: string | null | undefined,
  items: readonly T[],
): T["id"] | null {
  if (!value?.trim()) return null;
  const key = value.trim().toLowerCase();
  const found = items.find((item) => item.id === key || item.label.toLowerCase() === key);
  return found?.id ?? null;
}

function inferChoice<T extends { id: string; keywords: readonly string[] }>(
  title: string,
  items: readonly T[],
): T["id"] {
  const hay = title.toLowerCase();
  let best: { id: T["id"]; length: number } | null = null;
  for (const item of items) {
    for (const keyword of item.keywords) {
      if (!matchesKeyword(hay, keyword)) continue;
      if (!best || keyword.length > best.length) {
        best = { id: item.id, length: keyword.length };
      }
    }
  }
  if (best) return best.id;
  return items[hashString(title) % items.length].id;
}

function matchesKeyword(hay: string, keyword: string) {
  const words = hay.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const key = keyword.toLowerCase();
  return words.some((word) => {
    if (word === key) return true;
    if (key.length < 6 || word.length < 6) return false;
    const stem = 6;
    return word.slice(0, stem) === key.slice(0, stem);
  });
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
