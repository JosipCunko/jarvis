export type OpenRouterCreditStatus = {
  configured: boolean;
  kind: "wallet" | "key" | "unavailable" | "unconfigured";
  label: string;
  remaining: number | null;
  usageDaily: number | null;
  usageMonthly: number | null;
  limitRemaining: number | null;
  low: boolean;
};

export type ThesysCreditStatus = {
  configured: boolean;
  kind: "balance" | "unavailable" | "unconfigured";
  label: string;
  remaining: number | null;
  paid: number | null;
  free: number | null;
  low: boolean;
};

export type CreditsSnapshot = {
  openrouter: OpenRouterCreditStatus;
  thesys: ThesysCreditStatus;
  overview: string;
  spoken: string;
  low: boolean;
};
