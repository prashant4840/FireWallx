import type { TooltipProps } from "recharts";

/** Stable human labels per series key — no API/data changes. */
const SERIES_LABELS: Record<string, string> = {
  value: "Outcome",
  risk: "Risk score",
  responseMs: "Relative load"
};

const TRAFFIC_OUTCOMES = new Set(["ALLOW", "BLOCK", "RATE_LIMIT"]);

function formatOutcomeCategory(raw: string): string {
  return raw.replace(/_/g, " ");
}

function seriesDisplayName(dataKey: unknown, name: unknown): string {
  const key = String(dataKey ?? "").trim();
  if (key && SERIES_LABELS[key]) return SERIES_LABELS[key];
  const named = String(name ?? "").trim();
  if (named && SERIES_LABELS[named]) return SERIES_LABELS[named];
  if (named) return named;
  if (key) return key.charAt(0).toUpperCase() + key.slice(1);
  return "Value";
}

function resolveHeader(
  label: unknown,
  payload: NonNullable<TooltipProps<number, string>["payload"]>
): { eyebrow?: string; title: string } | null {
  const first = payload[0];
  const row = first?.payload as Record<string, unknown> | undefined;
  const dataKey = String(first?.dataKey ?? "");

  const labelStr = label !== undefined && label !== null ? String(label).trim() : "";
  const categoryFromRow = row && typeof row.name === "string" ? row.name.trim() : "";

  const category = TRAFFIC_OUTCOMES.has(labelStr)
    ? labelStr
    : TRAFFIC_OUTCOMES.has(categoryFromRow)
      ? categoryFromRow
      : "";

  if (category) {
    return {
      eyebrow: "Traffic outcome",
      title: formatOutcomeCategory(category)
    };
  }

  const numericLabel = labelStr !== "" && /^\d+$/.test(labelStr);

  if (dataKey === "risk") {
    return {
      eyebrow: "Risk trend",
      title: numericLabel ? `Observation ${labelStr}` : labelStr || "—"
    };
  }

  if (dataKey === "responseMs") {
    return {
      eyebrow: "Traffic over time",
      title: numericLabel ? `Observation ${labelStr}` : labelStr || "—"
    };
  }

  if (labelStr) return { title: labelStr };
  if (categoryFromRow) return { title: formatOutcomeCategory(categoryFromRow) };
  return null;
}

export const SocChartTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null;

  const header =
    resolveHeader(label, payload) ??
    (typeof payload[0]?.payload === "object" &&
    payload[0].payload !== null &&
    "name" in payload[0].payload &&
    String((payload[0].payload as { name?: string }).name).length > 0
      ? { title: String((payload[0].payload as { name?: string }).name) }
      : null);

  return (
    <div className="chart-tooltip">
      {header ? (
        <div className="chart-tooltip__header">
          {header.eyebrow ? <div className="chart-tooltip__eyebrow">{header.eyebrow}</div> : null}
          <div className="chart-tooltip__title">{header.title}</div>
        </div>
      ) : null}
      <div className="chart-tooltip__body">
        {payload.map((entry, i) => (
          <div key={i} className="chart-tooltip__row">
            <span className="chart-tooltip__dot" style={{ background: entry.color as string }} />
            <span className="chart-tooltip__name">{seriesDisplayName(entry.dataKey, entry.name)}</span>
            <span className="chart-tooltip__value">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
