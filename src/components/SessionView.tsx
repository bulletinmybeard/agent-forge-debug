import { useMemo, useState } from "react";
import { formatTime, pretty, shortId } from "../lib/format";
import { auditRows } from "../lib/sessions";
import type { AppSettings, AuditRow, ChatMessage, DebugBundle, LogLine } from "../lib/types";
import { ChatTab } from "./ChatTab";
import { SplitList } from "./SplitList";

type Tab = "overview" | "messages" | "audit" | "logs" | "chat";

type Props = {
  bundle: DebugBundle;
  settings: AppSettings;
  onBack: () => void;
};

export function SessionView({ bundle, settings, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [chatSeen, setChatSeen] = useState(false);
  const session = bundle.session;

  function selectTab(next: Tab) {
    if (next === "chat") {
      setChatSeen(true);
    }
    setTab(next);
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(session.id);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="session">
      <header className="chrome">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <div className="chrome__title">
          <strong>{session.title || "Untitled"}</strong>
          <span className="muted">{shortId(session.id, 12)}</span>
        </div>
        <button type="button" className="btn" onClick={() => void copyId()}>
          Copy UUID
        </button>
      </header>
      <nav className="tabs">
        {(["overview", "messages", "audit", "logs", "chat"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "tabs__btn tabs__btn--on" : "tabs__btn"}
            onClick={() => selectTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="session__body" hidden={tab === "chat"}>
        {tab === "overview" ? <Overview bundle={bundle} /> : null}
        {tab === "messages" ? <MessagesTab bundle={bundle} /> : null}
        {tab === "audit" ? <AuditTab bundle={bundle} /> : null}
        {tab === "logs" ? <LogsTab bundle={bundle} /> : null}
      </div>
      {chatSeen ? (
        <div className="session__body" hidden={tab !== "chat"}>
          <ChatTab key={bundle.session.id} bundle={bundle} settings={settings} />
        </div>
      ) : null}
    </div>
  );
}

function Overview({ bundle }: { bundle: DebugBundle }) {
  const s = bundle.session;
  const rows: [string, string][] = [
    ["id", s.id],
    ["source", s.source],
    ["profile", s.profile ?? ""],
    ["model", s.model ?? ""],
    ["provider", s.provider_override ?? ""],
    ["messages", String(s.message_count)],
    ["prompt tokens", String(s.prompt_tokens)],
    ["completion tokens", String(s.completion_tokens)],
    ["total tokens", String(s.total_tokens)],
    ["created", formatTime(s.created_at)],
    ["updated", formatTime(s.updated_at)],
    ["messages loaded", String(bundle.messages.length)],
    ["audit tools", String(bundle.audit_tools.length)],
    ["audit runs", String(bundle.audit_runs.length)],
    ["logs", String(bundle.logs.length)],
    ["truncated", bundle.truncated ? "yes" : "no"],
  ];
  return (
    <div className="overview">
      {bundle.messages_error ? (
        <p className="banner banner--error">{bundle.messages_error}</p>
      ) : null}
      {bundle.audit_error ? <p className="banner banner--error">{bundle.audit_error}</p> : null}
      {bundle.logs_error ? <p className="banner banner--error">{bundle.logs_error}</p> : null}
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k} className="kv__row">
            <dt>{k}</dt>
            <dd>{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MessagesTab({ bundle }: { bundle: DebugBundle }) {
  const [sel, setSel] = useState<number | null>(bundle.messages[0]?.id ?? null);
  const msg = bundle.messages.find((m) => m.id === sel) ?? null;
  if (bundle.messages_error) {
    return <p className="banner banner--error">{bundle.messages_error}</p>;
  }
  if (bundle.messages.length === 0) {
    return <p className="empty">No messages.</p>;
  }
  return (
    <SplitList
      list={
        <ul className="rows">
          {bundle.messages.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={m.id === sel ? "row row--on" : "row"}
                onClick={() => setSel(m.id)}
              >
                <span className="row__k">
                  {m.sequence} · {m.role} · {m.type}
                </span>
                <span className="row__v muted">{formatTime(m.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      }
      detail={msg ? <MessageDetail msg={msg} /> : <p className="empty">Select a message.</p>}
    />
  );
}

function MessageDetail({ msg }: { msg: ChatMessage }) {
  return (
    <div className="detail">
      <p className="muted">
        seq {msg.sequence} · {msg.role} · {msg.type}
      </p>
      {msg.content ? (
        <pre className="block">{msg.content}</pre>
      ) : (
        <p className="muted">No content.</p>
      )}
      {msg.metadata ? (
        <>
          <h3>metadata</h3>
          <pre className="block">{pretty(msg.metadata)}</pre>
        </>
      ) : null}
      {msg.tool_calls ? (
        <>
          <h3>tool_calls</h3>
          <pre className="block">{pretty(msg.tool_calls)}</pre>
        </>
      ) : null}
    </div>
  );
}

function AuditTab({ bundle }: { bundle: DebugBundle }) {
  const rows = useMemo(
    () => auditRows(bundle.audit_tools, bundle.audit_runs),
    [bundle.audit_tools, bundle.audit_runs],
  );
  const [sel, setSel] = useState<string | null>(rows[0]?.key ?? null);
  const row = rows.find((r) => r.key === sel) ?? null;
  if (bundle.audit_error) {
    return <p className="banner banner--error">{bundle.audit_error}</p>;
  }
  if (rows.length === 0) {
    return <p className="empty">No audit records.</p>;
  }
  return (
    <SplitList
      list={
        <ul className="rows">
          {rows.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                className={r.key === sel ? "row row--on" : "row"}
                onClick={() => setSel(r.key)}
              >
                <span className="row__k">
                  <span className="badge">{r.kind}</span> {r.title}
                </span>
                <span className="row__v muted">{formatTime(r.time)}</span>
              </button>
            </li>
          ))}
        </ul>
      }
      detail={row ? <AuditDetail row={row} /> : <p className="empty">Select a record.</p>}
    />
  );
}

function AuditDetail({ row }: { row: AuditRow }) {
  const entries = Object.entries(row.record);
  return (
    <div className="detail">
      <p className="muted">
        {row.kind} · {row.title}
      </p>
      <dl className="kv">
        {entries.map(([k, v]) => (
          <div key={k} className="kv__row">
            <dt>{k}</dt>
            <dd>
              <pre className="inline">{pretty(v)}</pre>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LogsTab({ bundle }: { bundle: DebugBundle }) {
  const [host, setHost] = useState("");
  const [job, setJob] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const hosts = useMemo(
    () => [...new Set(bundle.logs.map((l) => l.labels.host).filter(Boolean))].sort(),
    [bundle.logs],
  );
  const jobs = useMemo(
    () => [...new Set(bundle.logs.map((l) => l.labels.job).filter(Boolean))].sort(),
    [bundle.logs],
  );
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return bundle.logs.filter((l) => {
      if (host && l.labels.host !== host) {
        return false;
      }
      if (job && l.labels.job !== job) {
        return false;
      }
      return !(needle && !l.line.toLowerCase().includes(needle));
    });
  }, [bundle.logs, host, job, q]);
  const line: LogLine | undefined = filtered[sel];

  if (bundle.logs_error) {
    return <p className="banner banner--error">{bundle.logs_error}</p>;
  }
  if (bundle.logs.length === 0) {
    return <p className="empty">No logs.</p>;
  }

  return (
    <div className="logs">
      <div className="logs__filters">
        <select value={host} onChange={(e) => setHost(e.target.value)}>
          <option value="">all hosts</option>
          {hosts.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">all jobs</option>
          {jobs.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter text" />
      </div>
      <SplitList
        list={
          <ul className="rows">
            {filtered.map((l, i) => (
              <li key={`${l.ts_ns}:${l.line}`}>
                <button
                  type="button"
                  className={i === sel ? "row row--on" : "row"}
                  onClick={() => setSel(i)}
                >
                  <span className="row__k">
                    {l.labels.host ?? "?"} / {l.labels.job ?? "?"}
                  </span>
                  <span className="row__v">{l.line}</span>
                </button>
              </li>
            ))}
          </ul>
        }
        detail={
          line ? (
            <div className="detail">
              <p className="muted">
                {line.labels.host} · {line.labels.job} · {line.ts_ns}
              </p>
              <pre className="block">{line.line}</pre>
              <h3>labels</h3>
              <pre className="block">{pretty(line.labels)}</pre>
            </div>
          ) : (
            <p className="empty">Select a line.</p>
          )
        }
      />
    </div>
  );
}
