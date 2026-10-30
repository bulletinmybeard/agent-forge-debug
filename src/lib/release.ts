export type ReleaseRelation = "equal" | "behind" | "ahead" | "invalid";

export type GithubRelease = {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
};

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:$|[^\d])/;

function parts(raw: string): [number, number, number] | null {
  const match = raw.trim().match(SEMVER);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function formatVersion(raw: string): string {
  const parsed = parts(raw);
  if (!parsed) {
    const trimmed = raw.trim();
    return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
  }
  return `v${parsed[0]}.${parsed[1]}.${parsed[2]}`;
}

export function compareRelease(local: string, remote: string): ReleaseRelation {
  const left = parts(local);
  const right = parts(remote);
  if (!left || !right) {
    return "invalid";
  }
  for (let i = 0; i < 3; i += 1) {
    if (left[i] < right[i]) {
      return "behind";
    }
    if (left[i] > right[i]) {
      return "ahead";
    }
  }
  return "equal";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** First non-draft, non-prerelease entry. GitHub lists newest first. */
export function pickLatestRelease(releases: unknown): GithubRelease | null {
  if (!Array.isArray(releases)) {
    return null;
  }
  for (const item of releases) {
    if (!isRecord(item)) {
      continue;
    }
    if (item.draft === true || item.prerelease === true) {
      continue;
    }
    if (typeof item.tag_name !== "string" || typeof item.html_url !== "string") {
      continue;
    }
    return {
      tag_name: item.tag_name,
      html_url: item.html_url,
      draft: false,
      prerelease: false,
    };
  }
  return null;
}
