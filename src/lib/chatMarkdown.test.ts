import assert from "node:assert/strict";
import test from "node:test";
import { markdownToHtml } from "./chatMarkdown.ts";

test("renders headings, bold, lists, and inline code", () => {
  const html = markdownToHtml(
    [
      "**Yes — useful.** Based on the snapshot:",
      "",
      "## What the response delivered",
      "",
      "The assistant's result (message [5]) gave:",
      "",
      "- **Security finding**: Node.js 26.5.0 is affected by **10 CVEs**",
      "- Practical recommendation: upgrade",
      "",
      "All **7** tool calls succeeded (4 `web_search`, 3 `web_fetch`).",
    ].join("\n"),
  );
  assert.match(html, /<strong>Yes — useful\.<\/strong>/);
  assert.match(html, /<h2>What the response delivered<\/h2>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<strong>Security finding<\/strong>/);
  assert.match(html, /<code>web_search<\/code>/);
  assert.doesNotMatch(html, /\*\*/);
  assert.doesNotMatch(html, /## /);
});

test("escapes raw HTML", () => {
  const html = markdownToHtml("Hello <script>alert(1)</script> **x**");
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<strong>x<\/strong>/);
});

test("renders fenced code", () => {
  const html = markdownToHtml('```json\n{"a":1}\n```');
  assert.match(html, /<pre data-lang="json">/);
  assert.match(html, /&quot;a&quot;:1/);
});

test("renders a GFM table", () => {
  const html = markdownToHtml("| A | B |\n| --- | --- |\n| 1 | `id` |\n");
  assert.match(html, /<th>A<\/th>/);
  assert.match(html, /<td><code>id<\/code><\/td>/);
});
