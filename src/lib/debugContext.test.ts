import assert from "node:assert/strict";
import test from "node:test";
import {
  clip,
  compactDebugContext,
  MAX_DEBUG_CONTEXT_CHARS,
  parseDebugBundle,
  wrapQueryWithContext,
} from "./debugContext.ts";
import type { ChatMessage, DebugBundle, LogLine, SessionSummary } from "./types.ts";

function session(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "01a0759e-f96d-726e-a6d2-f6bf13522ed3",
    title: "Search test",
    source: "web",
    profile: "search",
    model: "glm-5.3:cloud",
    provider_override: null,
    message_count: 2,
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
    created_at: "2026-09-06T10:00:00",
    updated_at: "2026-09-06T10:01:00",
    ...over,
  };
}

function msg(over: Partial<ChatMessage> & { sequence: number }): ChatMessage {
  return {
    id: over.sequence,
    session_id: "01a0759e-f96d-726e-a6d2-f6bf13522ed3",
    role: "user",
    type: "query",
    content: "hello",
    metadata: null,
    tool_calls: null,
    is_incognito: false,
    is_volatile: false,
    created_at: "2026-09-06T10:00:00",
    ...over,
  };
}

function log(line: string, host = "mac"): LogLine {
  return { ts_ns: "1", line, labels: { host, job: "agentforge-worker" } };
}

function bundle(over: Partial<DebugBundle> = {}): DebugBundle {
  return {
    session: session(),
    messages: [],
    messages_error: null,
    audit_tools: [],
    audit_runs: [],
    audit_error: null,
    logs: [],
    logs_error: null,
    truncated: false,
    ...over,
  };
}

test("clip marks overflow", () => {
  assert.equal(clip("abc", 10), "abc");
  assert.match(clip("x".repeat(50), 20), /truncated/);
  assert.ok(clip("x".repeat(50), 20).length <= 20);
});

test("compactDebugContext keeps session id and skips huge tool payloads", () => {
  const huge = "SEARCH_HIT ".repeat(2000);
  const got = compactDebugContext(
    bundle({
      messages: [
        msg({
          sequence: 1,
          content: "Why did web_search fail?",
          tool_calls: [
            {
              name: "web_search",
              args: { query: "example search" },
              result: huge,
            },
          ],
        }),
      ],
      audit_tools: [
        {
          tool_name: "web_search",
          status: "error",
          error_message: "timeout",
          result_preview: huge,
        },
      ],
    }),
  );
  assert.match(got.text, /01a0759e-f96d-726e-a6d2-f6bf13522ed3/);
  assert.match(got.text, /web_search/);
  assert.match(got.text, /timeout/);
  assert.match(got.text, /truncated/);
  assert.ok(!got.text.includes(huge));
  assert.ok(got.text.length <= MAX_DEBUG_CONTEXT_CHARS);
  assert.equal(got.messageCount, 1);
  assert.equal(got.auditCount, 1);
});

test("compactDebugContext prefers error log lines", () => {
  const logs: LogLine[] = [
    log("info starting worker"),
    log("ERROR web_search timed out"),
    log("debug ping"),
    log("WARN retrying fetch"),
  ];
  const got = compactDebugContext(bundle({ logs }));
  assert.match(got.text, /ERROR web_search timed out/);
  assert.match(got.text, /WARN retrying fetch/);
  assert.ok(got.logCount >= 2);
});

test("wrapQueryWithContext injects once", () => {
  const ctx = compactDebugContext(bundle({ messages: [msg({ sequence: 1 })] }));
  const first = wrapQueryWithContext("Why did it fail?", ctx, false);
  const later = wrapQueryWithContext("And the second tool?", ctx, true);
  assert.match(first, /Why did it fail\?/);
  assert.match(first, /Debug snapshot:/);
  assert.match(first, /hello/);
  assert.equal(later, "And the second tool?");
});

test("parseDebugBundle rejects payloads without a session id", () => {
  assert.equal(parseDebugBundle(null), null);
  assert.equal(parseDebugBundle({ messages: [] }), null);
  assert.equal(parseDebugBundle({ session: { title: "x" } }), null);
});

test("parseDebugBundle fills collection defaults", () => {
  const got = parseDebugBundle({
    session: { id: "abc", title: "T", source: "web" },
    messages: [{ id: 1, session_id: "abc", role: "user", type: "query", sequence: 1 }],
    truncated: true,
  });
  assert.ok(got);
  assert.equal(got.session.id, "abc");
  assert.equal(got.messages.length, 1);
  assert.equal(got.messages[0]?.role, "user");
  assert.deepEqual(got.audit_tools, []);
  assert.deepEqual(got.audit_runs, []);
  assert.deepEqual(got.logs, []);
  assert.equal(got.messages_error, null);
  assert.equal(got.truncated, true);
});
