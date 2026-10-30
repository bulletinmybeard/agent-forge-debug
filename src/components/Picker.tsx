import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useState } from "react";
import { compareRelease, formatVersion, pickLatestRelease } from "../lib/release";
import { filterSessions, sessionLabel, uniqueSources } from "../lib/sessions";
import type { SessionSummary } from "../lib/types";

const RELEASES_URL = "https://api.github.com/repos/bulletinmybeard/agent-forge-debug/releases";

type RemoteRelease = {
  tag: string;
  url: string;
};

function ReleaseBadge() {
  const [local, setLocal] = useState("");
  const [remote, setRemote] = useState<RemoteRelease | null>(null);
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let version = "";
      try {
        version = await getVersion();
      } catch {
        return;
      }
      if (cancelled || !version.trim()) {
        return;
      }
      setLocal(version);
      try {
        const response = await fetch(RELEASES_URL, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) {
          return;
        }
        const latest = pickLatestRelease(await response.json());
        if (!latest || cancelled) {
          return;
        }
        const relation = compareRelease(version, latest.tag_name);
        if (relation === "equal") {
          setMatched(true);
          return;
        }
        if (relation === "behind") {
          setRemote({ tag: latest.tag_name, url: latest.html_url });
        }
      } catch {
        // keep the plain local label
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!local) {
    return null;
  }
  const label = formatVersion(local);
  if (matched) {
    return <span className="release release--current">{label}</span>;
  }
  if (remote) {
    return (
      <span className="release">
        <span className="release--local">{label}</span>
        <span className="release__sep">&gt;</span>
        <a
          className="release--remote"
          href={remote.url}
          rel="noreferrer"
          onClick={(event) => {
            event.preventDefault();
            void openUrl(remote.url).catch(() => undefined);
          }}
        >
          {formatVersion(remote.tag)}
        </a>
      </span>
    );
  }
  return <span className="release">{label}</span>;
}

type Props = {
  sessions: SessionSummary[];
  error: string | null;
  onOpen: (id: string) => void;
  onSettings: () => void;
  onReload: () => void;
};

export function Picker({ sessions, error, onOpen, onSettings, onReload }: Props) {
  const sources = useMemo(() => uniqueSources(sessions), [sessions]);
  const [source, setSource] = useState(sources[0] ?? "web");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [uuid, setUuid] = useState("");
  const filtered = useMemo(
    () => filterSessions(sessions, source, fromDate, toDate),
    [sessions, source, fromDate, toDate],
  );
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (sources.length > 0 && !sources.includes(source)) {
      setSource(sources[0]);
    }
  }, [sources, source]);

  return (
    <div className="picker">
      <header className="chrome chrome--end">
        <ReleaseBadge />
        <button type="button" className="btn" onClick={onReload}>
          Reload
        </button>
        <button type="button" className="btn" onClick={onSettings}>
          Settings
        </button>
      </header>
      <div className="picker__card">
        <h1>AgentForge Debug</h1>
        <p className="muted">Pick a session or jump to a UUID.</p>
        <div className="picker__row">
          <label>
            Source
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setSelected("");
              }}
            >
              {sources.length === 0 ? <option value="web">web</option> : null}
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select…</option>
              {filtered.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="picker__row">
          <label>
            From
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>
        <p className="muted">
          {filtered.length} session{filtered.length === 1 ? "" : "s"} in range
        </p>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!selected}
          onClick={() => selected && onOpen(selected)}
        >
          Open session
        </button>
        <div className="picker__jump">
          <input
            value={uuid}
            onChange={(e) => setUuid(e.target.value)}
            placeholder="session UUID"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter" && uuid.trim()) {
                onOpen(uuid.trim());
              }
            }}
          />
          <button
            type="button"
            className="btn btn--primary"
            disabled={!uuid.trim()}
            onClick={() => onOpen(uuid.trim())}
          >
            Open UUID
          </button>
        </div>
        {error ? <p className="banner banner--error">{error}</p> : null}
      </div>
    </div>
  );
}
