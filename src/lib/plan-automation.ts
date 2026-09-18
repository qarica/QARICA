export const PLAN_AUTOMATION_KINDS = ["ACTION", "INDICATOR", "MONITORING"] as const;
export type PlanAutomationKind = (typeof PLAN_AUTOMATION_KINDS)[number];

export type PlanAutomationResource = { id: string; label: string };

function fold(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function suggestPlanAutomationKind(input: {
  title?: unknown;
  description?: unknown;
  expectedResult?: unknown;
}): PlanAutomationKind {
  const text = fold([input.title, input.description, input.expectedResult].filter(Boolean).join(" "));
  if (!text) return "ACTION";

  const indicatorSignals = [
    /\bchi so\b/,
    /\bty le\b/,
    /\bkpi\b/,
    /\bindicator\b/,
    /\bdo luong\b/,
    /\btheo doi\b.*\b(chi so|ty le)\b/,
  ];
  if (indicatorSignals.some((pattern) => pattern.test(text))) return "INDICATOR";

  const monitoringSignals = [
    /\bgiam sat\b/,
    /\bbang kiem\b/,
    /\bkiem tra tuan thu\b/,
    /\bkiem tra dinh ky\b/,
    /\bmonitoring\b/,
  ];
  if (monitoringSignals.some((pattern) => pattern.test(text))) return "MONITORING";

  return "ACTION";
}

function tokens(value: unknown) {
  return fold(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !["theo", "thuc", "hien", "danh", "gia", "quan", "chat", "luong"].includes(token));
}

export function suggestPlanAutomationResource(
  text: unknown,
  resources: PlanAutomationResource[],
): PlanAutomationResource | null {
  const queryTokens = new Set(tokens(text));
  if (!queryTokens.size || !resources.length) return null;

  const scored = resources
    .map((resource) => {
      const labelTokens = new Set(tokens(resource.label));
      let score = 0;
      for (const token of queryTokens) if (labelTokens.has(token)) score += 1;
      return { resource, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.resource.label.localeCompare(b.resource.label, "vi"));

  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].resource;
}

export function automationKindLabel(kind: PlanAutomationKind) {
  if (kind === "INDICATOR") return "Chỉ số chất lượng";
  if (kind === "MONITORING") return "Đợt giám sát";
  return "Chỉ Action";
}
