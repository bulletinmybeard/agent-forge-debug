import assert from "node:assert/strict";
import test from "node:test";
import { compareRelease, formatVersion, pickLatestRelease } from "./release.ts";

test("v and bare versions compare equal", () => {
  assert.equal(compareRelease("v0.2.0", "0.2.0"), "equal");
  assert.equal(compareRelease("0.2.0", "v0.2.0"), "equal");
  assert.equal(formatVersion("0.2.0"), "v0.2.0");
  assert.equal(formatVersion("v0.2.0"), "v0.2.0");
});

test("local behind remote", () => {
  assert.equal(compareRelease("0.2.0", "v0.2.1"), "behind");
  assert.equal(compareRelease("v1.2.3", "v1.2.5"), "behind");
  assert.equal(compareRelease("1.2.3", "1.3.0"), "behind");
  assert.equal(compareRelease("1.2.3", "2.0.0"), "behind");
});

test("local ahead of remote", () => {
  assert.equal(compareRelease("0.3.0", "v0.2.9"), "ahead");
});

test("invalid tag does not compare", () => {
  assert.equal(compareRelease("0.2.0", "latest"), "invalid");
  assert.equal(compareRelease("nope", "v0.2.0"), "invalid");
});

test("pickLatestRelease skips draft and prerelease and keeps html_url", () => {
  const url = "https://github.com/bulletinmybeard/agent-forge-debug/releases/tag/v0.2.0";
  const got = pickLatestRelease([
    {
      tag_name: "v0.3.0",
      html_url: "https://example.com/draft",
      draft: true,
      prerelease: false,
    },
    {
      tag_name: "v0.2.1-rc.1",
      html_url: "https://example.com/rc",
      draft: false,
      prerelease: true,
    },
    { tag_name: "v0.2.0", html_url: url, draft: false, prerelease: false },
  ]);
  assert.deepEqual(got, {
    tag_name: "v0.2.0",
    html_url: url,
    draft: false,
    prerelease: false,
  });
});

test("pickLatestRelease returns null when nothing is stable", () => {
  assert.equal(pickLatestRelease([]), null);
  assert.equal(pickLatestRelease("nope"), null);
  assert.equal(
    pickLatestRelease([
      { tag_name: "v0.1.0", html_url: "https://example.com/rc", draft: false, prerelease: true },
    ]),
    null,
  );
});
