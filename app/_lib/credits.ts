import "server-only";
import type {
  CreditsSnapshot,
  OpenRouterCreditStatus,
  ThesysCreditStatus,
} from "@/app/_types/credits";

const CACHE_MS = 60_000;
const LOW_USD = 1;
const OPENROUTER_ORIGIN = "https://openrouter.ai/api/v1";
const THESYS_PROBES = [
  "https://api.thesys.dev/v1/credits",
  "https://api.thesys.dev/v1/billing",
  "https://api.thesys.dev/v1/usage",
];

const FREE_KEYS = new Set([
  "free_credits",
  "free_credit",
  "freecredits",
  "free_balance",
  "promotional_credits",
  "promo_credits",
]);
const PAID_KEYS = new Set([
  "paid",
  "paid_credits",
  "paid_credit",
  "paid_balance",
  "purchased_credits",
]);
const REMAINING_KEYS = new Set([
  "remaining",
  "balance",
  "credit_balance",
  "credits_remaining",
  "available_credits",
  "available_balance",
]);

let cache: { at: number; value: CreditsSnapshot } | null = null;

export function money(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export async function getProviderCredits(): Promise<CreditsSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const [openrouter, thesys] = await Promise.all([
    loadOpenRouter(),
    loadThesys(),
  ]);
  const value = assemble(openrouter, thesys);
  cache = { at: Date.now(), value };
  return value;
}

function assemble(
  openrouter: OpenRouterCreditStatus,
  thesys: ThesysCreditStatus,
): CreditsSnapshot {
  const low = openrouter.low || thesys.low;
  return {
    openrouter,
    thesys,
    overview: overviewLine(openrouter, thesys),
    spoken: spokenLine(openrouter, thesys),
    low,
  };
}

function overviewLine(openrouter: OpenRouterCreditStatus, thesys: ThesysCreditStatus) {
  let orPart = "OR n/a";
  if (!openrouter.configured) orPart = "OR off";
  else if (openrouter.kind === "wallet" && openrouter.remaining != null) {
    orPart = `OR ${money(openrouter.remaining)}`;
  } else if (openrouter.kind === "key" && openrouter.usageDaily != null) {
    orPart = `OR key ${money(openrouter.usageDaily)} today`;
  }

  let thesysPart = "Thesys n/a";
  if (!thesys.configured) thesysPart = "Thesys off";
  else if (thesys.kind === "balance" && thesys.paid != null && thesys.free != null) {
    thesysPart = `Thesys ${money(thesys.paid)} + ${money(thesys.free)} free`;
  } else if (thesys.kind === "balance" && thesys.remaining != null) {
    thesysPart = `Thesys ${money(thesys.remaining)}`;
  }
  return `${orPart} · ${thesysPart}`;
}

function spokenLine(openrouter: OpenRouterCreditStatus, thesys: ThesysCreditStatus) {
  const parts: string[] = [];
  if (!openrouter.configured) {
    parts.push("OpenRouter is not configured.");
  } else if (openrouter.kind === "wallet" && openrouter.remaining != null) {
    parts.push(`OpenRouter has ${money(openrouter.remaining)} left.`);
  } else if (openrouter.kind === "key") {
    const today =
      openrouter.usageDaily != null ? money(openrouter.usageDaily) : "an unknown amount";
    const month =
      openrouter.usageMonthly != null ? money(openrouter.usageMonthly) : "an unknown amount";
    const cap =
      openrouter.limitRemaining != null
        ? ` This key has ${money(openrouter.limitRemaining)} left on its cap.`
        : "";
    parts.push(
      `OpenRouter key spend is ${today} today and ${month} this month.${cap} The account wallet needs a management key.`,
    );
  } else {
    parts.push("OpenRouter balance is unavailable.");
  }

  if (!thesys.configured) {
    parts.push("Thesys is not configured.");
  } else if (thesys.kind === "balance" && thesys.paid != null && thesys.free != null) {
    parts.push(
      `Thesys has ${money(thesys.paid)} paid and ${money(thesys.free)} in free credits.`,
    );
  } else if (thesys.kind === "balance" && thesys.remaining != null) {
    parts.push(`Thesys has ${money(thesys.remaining)} left.`);
  } else {
    parts.push("Thesys is linked, but it does not expose a live balance.");
  }
  return parts.join(" ");
}

async function loadOpenRouter(): Promise<OpenRouterCreditStatus> {
  const inference = process.env.OPENROUTER_API_KEY?.trim() || "";
  const management = process.env.OPENROUTER_MANAGEMENT_KEY?.trim() || "";
  if (!inference && !management) return openRouterUnconfigured();

  const inferenceWallet = inference ? await readWallet(inference) : null;
  if (inferenceWallet?.status === "ok") return inferenceWallet.credits;
  const denied = inferenceWallet?.status === "denied";
  if ((!inference || denied) && management && management !== inference) {
    const managementWallet = await readWallet(management);
    if (managementWallet?.status === "ok") return managementWallet.credits;
  }

  if (!inference) return openRouterUnavailable();
  return (await readKey(inference)) ?? openRouterUnavailable();
}

async function readWallet(key: string): Promise<
  { status: "ok"; credits: OpenRouterCreditStatus } | { status: "denied" | "miss" }
> {
  const attempt = await openRouterGet("/credits", key);
  if (attempt.status === 401 || attempt.status === 403) return { status: "denied" };
  const totals = attempt.ok ? readWalletBody(attempt.json) : null;
  if (!totals) return { status: "miss" };
  const remaining = totals.totalCredits - totals.totalUsage;
  return {
    status: "ok",
    credits: {
      configured: true,
      kind: "wallet",
      label: `${money(remaining)} left`,
      remaining,
      usageDaily: null,
      usageMonthly: null,
      limitRemaining: null,
      low: remaining < LOW_USD,
    },
  };
}

async function readKey(key: string): Promise<OpenRouterCreditStatus | null> {
  const attempt = await openRouterGet("/key", key);
  if (!attempt.ok) return null;
  const data = record(record(attempt.json)?.data);
  if (!data) return null;
  const usageDaily = finite(data.usage_daily);
  const usageMonthly = finite(data.usage_monthly);
  const limitRemaining = finite(data.limit_remaining);
  if (usageDaily == null && usageMonthly == null && limitRemaining == null) return null;
  const bits = [
    usageDaily != null ? `Today ${money(usageDaily)}` : "",
    usageMonthly != null ? `month ${money(usageMonthly)}` : "",
    limitRemaining != null ? `${money(limitRemaining)} left on key` : "",
    "wallet needs a management key",
  ].filter(Boolean);
  return {
    configured: true,
    kind: "key",
    label: bits.join(" · "),
    remaining: null,
    usageDaily,
    usageMonthly,
    limitRemaining,
    low: limitRemaining != null && limitRemaining < LOW_USD,
  };
}

function openRouterUnavailable(): OpenRouterCreditStatus {
  return {
    configured: true,
    kind: "unavailable",
    label: "Balance unavailable",
    remaining: null,
    usageDaily: null,
    usageMonthly: null,
    limitRemaining: null,
    low: false,
  };
}

function openRouterUnconfigured(): OpenRouterCreditStatus {
  return {
    configured: false,
    kind: "unconfigured",
    label: "Set OPENROUTER_API_KEY",
    remaining: null,
    usageDaily: null,
    usageMonthly: null,
    limitRemaining: null,
    low: false,
  };
}

function readWalletBody(json: unknown) {
  const body = record(json);
  const data = record(body?.data) ?? body;
  if (!data) return null;
  const totalCredits = finite(data.total_credits);
  const totalUsage = finite(data.total_usage);
  if (totalCredits == null || totalUsage == null) return null;
  return { totalCredits, totalUsage };
}

async function loadThesys(): Promise<ThesysCreditStatus> {
  const key = process.env.THESYS_API_KEY?.trim() || "";
  if (!key) {
    return {
      configured: false,
      kind: "unconfigured",
      label: "Set THESYS_API_KEY",
      remaining: null,
      paid: null,
      free: null,
      low: false,
    };
  }

  const probes = await Promise.all(THESYS_PROBES.map((url) => thesysGet(url, key)));
  for (const probe of probes) {
    if (!probe.ok) continue;
    const parsed = parseThesysBody(probe.json);
    if (parsed) return parsed;
  }

  return {
    configured: true,
    kind: "unavailable",
    label: "Linked, balance unavailable",
    remaining: null,
    paid: null,
    free: null,
    low: false,
  };
}

export function parseThesysBody(json: unknown): ThesysCreditStatus | null {
  const paid = findNumber(json, PAID_KEYS);
  const free = findNumber(json, FREE_KEYS);
  const direct = findNumber(json, REMAINING_KEYS);
  const total = findNumber(json, new Set(["total_credits"]));
  const usage = findNumber(json, new Set(["total_usage"]));
  const fromTotals = total != null && usage != null ? total - usage : null;

  if (paid != null && free != null) {
    const remaining = paid + free;
    return thesysBalance({
      paid,
      free,
      remaining,
      label: `${money(paid)} paid · ${money(free)} free`,
    });
  }
  if (direct != null && free != null) {
    return thesysBalance({
      paid: direct,
      free,
      remaining: direct + free,
      label: `${money(direct)} paid · ${money(free)} free`,
    });
  }
  if (fromTotals != null && free != null) {
    return thesysBalance({
      paid: fromTotals,
      free,
      remaining: fromTotals + free,
      label: `${money(fromTotals)} paid · ${money(free)} free`,
    });
  }
  const remaining = direct ?? fromTotals ?? paid;
  if (remaining == null) return null;
  return thesysBalance({
    paid: null,
    free: free,
    remaining,
    label: `${money(remaining)} left`,
  });
}

function thesysBalance(input: {
  paid: number | null;
  free: number | null;
  remaining: number;
  label: string;
}): ThesysCreditStatus {
  const spendable =
    input.paid != null || input.free != null
      ? (input.paid ?? 0) + (input.free ?? 0)
      : input.remaining;
  return {
    configured: true,
    kind: "balance",
    label: input.label,
    remaining: input.remaining,
    paid: input.paid,
    free: input.free,
    low: spendable < LOW_USD,
  };
}

function findNumber(value: unknown, names: Set<string>, depth = 0): number | null {
  if (depth > 4) return null;
  const body = record(value);
  if (!body) return null;
  for (const [key, nested] of Object.entries(body)) {
    if (!names.has(key.toLowerCase())) continue;
    const amount = finite(nested);
    if (amount != null) return amount;
  }
  for (const nested of Object.values(body)) {
    const found = findNumber(nested, names, depth + 1);
    if (found != null) return found;
  }
  return null;
}

async function openRouterGet(path: string, key: string) {
  return readJson(`${OPENROUTER_ORIGIN}${path}`, key);
}

async function thesysGet(url: string, key: string) {
  return readJson(url, key);
}

async function readJson(url: string, key: string) {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const json = (await response.json().catch(() => null)) as unknown;
    return { ok: response.ok, status: response.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finite(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
