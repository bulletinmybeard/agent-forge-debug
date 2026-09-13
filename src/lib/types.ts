export type SessionSummary = {
  id: string;
  title: string;
  profile?: string | null;
  model?: string | null;
  provider_override?: string | null;
  source: string;
  message_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  created_at: string | null;
  updated_at: string | null;
};

export type ChatMessage = {
  id: number;
  session_id: string;
  role: string;
  type: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  tool_calls: unknown[] | null;
  sequence: number;
  is_incognito: boolean;
  is_volatile: boolean;
  created_at: string | null;
};

export type LogLine = {
  ts_ns: string;
  line: string;
  labels: Record<string, string>;
};

export type DebugBundle = {
  session: SessionSummary;
  messages: ChatMessage[];
  messages_error: string | null;
  audit_tools: Record<string, unknown>[];
  audit_runs: Record<string, unknown>[];
  audit_error: string | null;
  logs: LogLine[];
  logs_error: string | null;
  truncated: boolean;
};

export type AppSettings = {
  base_url: string;
  api_key: string;
};

export type AuditKind = "tool" | "run";

export type AuditRow = {
  kind: AuditKind;
  key: string;
  title: string;
  time: string | null;
  record: Record<string, unknown>;
};
