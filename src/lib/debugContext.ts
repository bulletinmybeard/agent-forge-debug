import { parseSessionSummary } from "./sessions.ts";
import type { ChatMessage, DebugBundle, LogLine } from "./types";

export const MAX_DEBUG_CONTEXT_CHARS = 24_000;
const MAX_FIELD = 1_200;
const MAX_TOOL_FIELD = 400;
const MAX_LOG_LINE = 240;

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

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (rec) {
      out.push(rec);
    }
  }
  return out;
}

function parseMessage(raw: unknown): ChatMessage | null {
  const o = asRecord(raw);
  if (!o) {
    return null;
  }
  return {
    id: asFiniteNumber(o.id),
    session_id: asString(o.session_id),
    role: asString(o.role),
    type: asString(o.type),
    content: asNullableString(o.content),
    metadata: asRecord(o.metadata),
    tool_calls: Array.isArray(o.tool_calls) ? o.tool_calls : null,
    sequence: asFiniteNumber(o.sequence),
    is_incognito: o.is_incognito === true,
    is_volatile: o.is_volatile === true,
    created_at: asNullableString(o.created_at),
  };
}

function parseLog(raw: unknown): LogLine | null {
  const o = asRecord(raw);
  if (!o) {
    return null;
  }
  const labels: Record<string, string> = {};
  const rawLabels = asRecord(o.labels);
  if (rawLabels) {
    for (const [k, v] of Object.entries(rawLabels)) {
      if (typeof v === "string") {
        labels[k] = v;
      }
    }
  }
  return {
    ts_ns: o.ts_ns == null ? "" : String(o.ts_ns),
    line: asString(o.line),
    labels,
  };
}

export function parseDebugBundle(raw: unknown): DebugBundle | null {
  const o = asRecord(raw);
  if (!o) {
    return null;
  }
  const session = parseSessionSummary(o.session);
  if (!session) {
    return null;
  }
  const messages: ChatMessage[] = [];
  if (Array.isArray(o.messages)) {
    for (const item of o.messages) {
      const msg = parseMessage(item);
      if (msg) {
        messages.push(msg);
      }
    }
  }
  const logs: LogLine[] = [];
  if (Array.isArray(o.logs)) {
    for (const item of o.logs) {
      const line = parseLog(item);
      if (line) {
        logs.push(line);
      }
    }
  }
  return {
    session,
    messages,
    messages_error: asNullableString(o.messages_error),
    audit_tools: asRecordArray(o.audit_tools),
    audit_runs: asRecordArray(o.audit_runs),
    audit_error: asNullableString(o.audit_error),
    logs,
    logs_error: asNullableString(o.logs_error),
    truncated: o.truncated === true,
  };
}

export function clip(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const keep = Math.max(0, max - 14);
  return `${text.slice(0, keep)}\n…[truncated]`;
}

export function clipValue(value: unknown, max: number): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return clip(value, max);
  }
  try {
    return clip(JSON.stringify(value), max);
  } catch {
    return clip(String(value), max);
  }
}

function logPriority(line: string): number {
  const t = line.toLowerCase();
  if (/(error|exception|traceback|failed|fatal)/.test(t)) {
    return 0;
  }
  if (/warn/.test(t)) {
    return 1;
  }
  return 2;
}

function pickLogs(logs: LogLine[], maxChars: number): LogLine[] {
  const scored = logs.map((l, i) => ({ l, i, p: logPriority(l.line) }));
  scored.sort((a, b) => a.p - b.p || a.i - b.i);
  const picked = new Set<number>();
  let used = 0;
  for (const s of scored) {
    const n = Math.min(s.l.line.length, MAX_LOG_LINE) + 24;
    if (picked.size > 0 && used + n > maxChars) {
      break;
    }
    picked.add(s.i);
    used += n;
  }
  return logs.filter((_, i) => picked.has(i));
}

function formatToolCalls(calls: unknown[] | null): string {
  if (!calls || calls.length === 0) {
    return "";
  }
  const lines: string[] = [];
  for (const raw of calls) {
    if (!raw || typeof raw !== "object") {
      lines.push(`- ${clipValue(raw, MAX_TOOL_FIELD)}`);
      continue;
    }
    const tc = raw as Record<string, unknown>;
    const name = String(tc.name ?? tc.tool ?? "tool");
    const args = tc.args ?? tc.arguments ?? tc.input;
    const result = tc.result ?? tc.output;
    const bits = [`- ${name}`];
    if (args != null) {
      bits.push(`args=${clipValue(args, MAX_TOOL_FIELD)}`);
    }
    if (result != null) {
      bits.push(`result=${clipValue(result, MAX_TOOL_FIELD)}`);
    }
    lines.push(bits.join(" "));
  }
  return lines.join("\n");
}

function formatMessage(msg: ChatMessage): string {
  const head = `[${msg.sequence}] ${msg.role}/${msg.type}`;
  const meta = msg.metadata ?? {};
  const extras: string[] = [];
  for (const key of ["mode", "profile", "model", "reason", "provider"] as const) {
    const v = meta[key];
    if (v != null && String(v).trim()) {
      extras.push(`${key}=${clip(String(v), 200)}`);
    }
  }
  const parts = [extras.length ? `${head} ${extras.join(" ")}` : head];
  if (msg.content?.trim()) {
    parts.push(clip(msg.content, MAX_FIELD));
  }
  const tools = formatToolCalls(msg.tool_calls);
  if (tools) {
    parts.push("tool_calls:");
    parts.push(tools);
  }
  return parts.join("\n");
}

function formatAudit(record: Record<string, unknown>): string {
  const name = String(record.tool_name ?? record.tool ?? record.event ?? "record");
  const keys = [
    "status",
    "error_message",
    "duration_ms",
    "timestamp",
    "mode",
    "model",
    "source",
    "args_json",
    "result_preview",
  ];
  const bits = [name];
  for (const key of keys) {
    const v = record[key];
    if (v == null || v === "") {
      continue;
    }
    bits.push(`${key}=${clipValue(v, MAX_TOOL_FIELD)}`);
  }
  return `- ${bits.join(" ")}`;
}

export type CompactDebugContext = {
  text: string;
  truncated: boolean;
  messageCount: number;
  auditCount: number;
  logCount: number;
};

export function compactDebugContext(bundle: DebugBundle): CompactDebugContext {
  const s = bundle.session;
  const header = [
    "You are answering questions about one AgentForge debug snapshot.",
    "Use only the data below. If it does not contain the answer, say so.",
    "Do not invent log lines, tool results, or messages.",
    "This chat is a separate AgentForge session (source=debug).",
    "Do not treat the inspected UUID as this conversation id.",
    "",
    "# Session",
    `id=${s.id}`,
    `title=${s.title || "Untitled"}`,
    `source=${s.source}`,
    `profile=${s.profile ?? ""}`,
    `model=${s.model ?? ""}`,
    `provider=${s.provider_override ?? ""}`,
    `messages=${s.message_count} prompt_tokens=${s.prompt_tokens} completion_tokens=${s.completion_tokens} total_tokens=${s.total_tokens}`,
    `created=${s.created_at ?? ""} updated=${s.updated_at ?? ""}`,
    `truncated=${bundle.truncated ? "yes" : "no"}`,
    bundle.messages_error ? `messages_error=${bundle.messages_error}` : "",
    bundle.audit_error ? `audit_error=${bundle.audit_error}` : "",
    bundle.logs_error ? `logs_error=${bundle.logs_error}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const messageBudget = 12_000;
  const messageBlocks: string[] = [];
  let messageChars = 0;
  let messageCount = 0;
  for (const msg of bundle.messages) {
    const block = formatMessage(msg);
    if (messageCount > 0 && messageChars + block.length + 2 > messageBudget) {
      break;
    }
    messageBlocks.push(block);
    messageChars += block.length + 2;
    messageCount += 1;
  }

  const auditRecords = [...bundle.audit_tools, ...bundle.audit_runs];
  const auditBudget = 6_000;
  const auditLines: string[] = [];
  let auditChars = 0;
  let auditCount = 0;
  for (const rec of auditRecords) {
    const line = formatAudit(rec);
    if (auditCount > 0 && auditChars + line.length + 1 > auditBudget) {
      break;
    }
    auditLines.push(line);
    auditChars += line.length + 1;
    auditCount += 1;
  }

  const logBudget = 6_000;
  const pickedLogs = pickLogs(bundle.logs, logBudget);
  const logLines = pickedLogs.map((l) => {
    const host = l.labels.host ?? "?";
    const job = l.labels.job ?? "?";
    return `${host}/${job} ${clip(l.line, MAX_LOG_LINE)}`;
  });

  const omittedMessages = bundle.messages.length - messageCount;
  const omittedAudit = auditRecords.length - auditCount;
  const omittedLogs = bundle.logs.length - pickedLogs.length;

  const body = [
    header,
    "",
    `# Messages (showing ${messageCount} of ${bundle.messages.length})`,
    messageBlocks.join("\n\n") || "(none)",
    omittedMessages > 0 ? `…${omittedMessages} later messages omitted` : "",
    "",
    `# Audit (showing ${auditCount} of ${auditRecords.length})`,
    auditLines.join("\n") || "(none)",
    omittedAudit > 0 ? `…${omittedAudit} later audit rows omitted` : "",
    "",
    `# Logs (showing ${pickedLogs.length} of ${bundle.logs.length}; errors/warnings first)`,
    logLines.join("\n") || "(none)",
    omittedLogs > 0 ? `…${omittedLogs} log lines omitted` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const truncated =
    body.length > MAX_DEBUG_CONTEXT_CHARS ||
    omittedMessages > 0 ||
    omittedAudit > 0 ||
    omittedLogs > 0;
  return {
    text: clip(body, MAX_DEBUG_CONTEXT_CHARS),
    truncated,
    messageCount,
    auditCount,
    logCount: pickedLogs.length,
  };
}

export function wrapQueryWithContext(
  question: string,
  context: CompactDebugContext,
  alreadySent: boolean,
): string {
  const q = question.trim();
  if (alreadySent) {
    return q;
  }
  return `${q}\n\n---\nDebug snapshot:\n${context.text}`;
}
