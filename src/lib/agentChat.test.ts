import assert from "node:assert/strict";
import test from "node:test";
import { DEBUG_CHAT_SOURCE, toWsChatUrl } from "./agentChat.ts";

test("toWsChatUrl maps https to wss and stamps source", () => {
  assert.equal(
    toWsChatUrl("https://agentforge.example.com/", null, DEBUG_CHAT_SOURCE),
    "wss://agentforge.example.com/ws/chat?source=debug",
  );
});

test("toWsChatUrl maps http to ws and adds session_id", () => {
  assert.equal(
    toWsChatUrl("http://127.0.0.1:8200", "abc-123", "debug"),
    "ws://127.0.0.1:8200/ws/chat?source=debug&session_id=abc-123",
  );
});
