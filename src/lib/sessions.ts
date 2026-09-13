import type { AuditRow, SessionSummary } from "./types";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return fallback;
}

export function parseSessionSummary(raw: unknown): SessionSummary | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const id = asString(o.id).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    title: asString(o.title),
    profile: asNullableString(o.profile),
    model: asNullableString(o.model),
    provider_override: asNullableString(o.provider_override),
    source: asString(o.source, "web") || "web",
    message_count: asFiniteNumber(o.message_count),
    prompt_tokens: asFiniteNumber(o.prompt_tokens),
    completion_tokens: asFiniteNumber(o.completion_tokens),
    total_tokens: asFiniteNumber(o.total_tokens),
    created_at: asNullableString(o.created_at),
    updated_at: asNullableString(o.updated_at),
  };
}

export function parseSessionSummaries(raw: unknown): SessionSummary[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: SessionSummary[] = [];
  for (const item of raw) {
    const row = parseSessionSummary(item);
    if (row) {
      out.push(row);
    }
  }
  return out;
}

export function uniqueSources(sessions: SessionSummary[]): string[] {
  const set = new Set<string>();
  for (const s of sessions) {
    set.add(s.source || "web");
  }
  return [...set].sort();
}

export function datePrefix(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  return iso.slice(0, 10);
}

export function filterSessions(
  sessions: SessionSummary[],
  source: string,
  fromDate: string,
  toDate: string,
): SessionSummary[] {
  return sessions.filter((s) => {
    if (source && (s.source || "web") !== source) {
      return false;
    }
    const day = datePrefix(s.created_at) || datePrefix(s.updated_at);
    if (fromDate && day && day < fromDate) {
      return false;
    }
    if (toDate && day && day > toDate) {
      return false;
    }
    return true;
  });
}

export function sessionLabel(s: SessionSummary): string {
  const title = (s.title || "Untitled").trim() || "Untitled";
  return `${s.id}  ${title}`;
}

export function auditRows(
  tools: Record<string, unknown>[],
  runs: Record<string, unknown>[],
): AuditRow[] {
  const out: AuditRow[] = [];
  tools.forEach((record, i) => {
    const name = String(record.tool_name ?? record.tool ?? "tool");
    const time = record.timestamp != null ? String(record.timestamp) : null;
    out.push({
      kind: "tool",
      key: `tool-${i}`,
      title: name,
      time,
      record,
    });
  });
  runs.forEach((record, i) => {
    const event = String(record.event ?? "run");
    const time = record.timestamp != null ? String(record.timestamp) : null;
    out.push({
      kind: "run",
      key: `run-${i}`,
      title: event,
      time,
      record,
    });
  });
  return out;
}
