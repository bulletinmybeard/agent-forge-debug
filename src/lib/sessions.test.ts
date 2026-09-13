import assert from "node:assert/strict";
import test from "node:test";
import { filterSessions, parseSessionSummaries, uniqueSources } from "./sessions.ts";
import type { SessionSummary } from "./types.ts";

function sess(id: string, source: string, created_at: string, title = "t"): SessionSummary {
  return {
    id,
    title,
    source,
    message_count: 1,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    created_at,
    updated_at: created_at,
  };
}

const rows: SessionSummary[] = [
  sess("a", "web", "2026-09-05T11:00:00"),
  sess("b", "kb", "2026-09-01T08:00:00"),
  sess("c", "web", "2026-08-20T08:00:00"),
];

test("uniqueSources sorts distinct sources", () => {
  assert.deepEqual(uniqueSources(rows), ["kb", "web"]);
});

test("filterSessions by source", () => {
  const got = filterSessions(rows, "web", "", "");
  assert.deepEqual(
    got.map((s) => s.id),
    ["a", "c"],
  );
});

test("filterSessions by date range inclusive", () => {
  const got = filterSessions(rows, "", "2026-09-01", "2026-09-05");
  assert.deepEqual(
    got.map((s) => s.id),
    ["a", "b"],
  );
});

test("filterSessions source plus date", () => {
  const got = filterSessions(rows, "web", "2026-09-01", "2026-09-06");
  assert.deepEqual(
    got.map((s) => s.id),
    ["a"],
  );
});

test("parseSessionSummaries returns empty for non-arrays", () => {
  assert.deepEqual(parseSessionSummaries(null), []);
  assert.deepEqual(parseSessionSummaries({ id: "x" }), []);
});

test("parseSessionSummaries drops rows without a string id", () => {
  const got = parseSessionSummaries([
    { title: "no id" },
    { id: 12, title: "numeric" },
    { id: "  ", title: "blank" },
    { id: "keep-me", title: "ok", source: "web" },
  ]);
  assert.deepEqual(
    got.map((s) => s.id),
    ["keep-me"],
  );
});

test("parseSessionSummaries fills defaults and keeps known fields", () => {
  const got = parseSessionSummaries([
    {
      id: "abc",
      title: "Search test",
      profile: "search",
      model: "glm",
      provider_override: null,
      source: "kb",
      message_count: 2,
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      created_at: "2026-09-06T10:00:00",
      updated_at: "2026-09-06T10:01:00",
    },
    { id: "bare" },
  ]);
  assert.equal(got.length, 2);
  assert.equal(got[0]?.title, "Search test");
  assert.equal(got[0]?.source, "kb");
  assert.equal(got[0]?.message_count, 2);
  assert.equal(got[0]?.total_tokens, 30);
  assert.equal(got[1]?.id, "bare");
  assert.equal(got[1]?.title, "");
  assert.equal(got[1]?.source, "web");
  assert.equal(got[1]?.message_count, 0);
  assert.equal(got[1]?.created_at, null);
});
