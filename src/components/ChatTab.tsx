import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentChatClient,
  type AgentChatEvent,
  DEBUG_CHAT_MODE,
  DEBUG_CHAT_SOURCE,
} from "../lib/agentChat";
import { markdownToHtml } from "../lib/chatMarkdown";
import { compactDebugContext, wrapQueryWithContext } from "../lib/debugContext";
import type { AppSettings, DebugBundle } from "../lib/types";

type ToolStatus = "running" | "done" | "error";

type Bubble =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; streaming?: boolean }
  | { id: string; role: "tool"; name: string; status: ToolStatus }
  | { id: string; role: "system"; text: string };

type StoredChat = {
  agentSessionId: string | null;
  contextSent: boolean;
  bubbles: Bubble[];
};

const MAX_STORED_BUBBLES = 100;

function storeKey(sessionId: string): string {
  return `afdebug.chat.v1:${sessionId}`;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isBubble(v: unknown): v is Bubble {
  if (!v || typeof v !== "object") {
    return false;
  }
  const b = v as Record<string, unknown>;
  if (b.role === "tool") {
    return typeof b.id === "string" && typeof b.name === "string";
  }
  if (b.role !== "user" && b.role !== "assistant" && b.role !== "system") {
    return false;
  }
  return typeof b.id === "string" && typeof b.text === "string";
}

function normalizeBubble(b: Bubble): Bubble {
  if (b.role === "assistant") {
    return { id: b.id, role: "assistant", text: b.text, streaming: false };
  }
  if (b.role === "tool") {
    return {
      id: b.id,
      role: "tool",
      name: b.name,
      status: b.status === "error" ? "error" : "done",
    };
  }
  return b;
}

function loadStore(inspectedId: string): StoredChat {
  try {
    const raw = localStorage.getItem(storeKey(inspectedId));
    if (!raw) {
      return { agentSessionId: null, contextSent: false, bubbles: [] };
    }
    const parsed = JSON.parse(raw) as Partial<StoredChat>;
    const bubbles = Array.isArray(parsed.bubbles)
      ? parsed.bubbles.filter(isBubble).slice(-MAX_STORED_BUBBLES).map(normalizeBubble)
      : [];
    return {
      agentSessionId: typeof parsed.agentSessionId === "string" ? parsed.agentSessionId : null,
      contextSent: parsed.contextSent === true,
      bubbles,
    };
  } catch {
    return { agentSessionId: null, contextSent: false, bubbles: [] };
  }
}

function saveStore(inspectedId: string, next: StoredChat): void {
  const payload: StoredChat = {
    agentSessionId: next.agentSessionId,
    contextSent: next.contextSent,
    bubbles: next.bubbles.slice(-MAX_STORED_BUBBLES).map(normalizeBubble),
  };
  localStorage.setItem(storeKey(inspectedId), JSON.stringify(payload));
}

function markTools(prev: Bubble[], status: ToolStatus): Bubble[] {
  return prev.map((b) => (b.role === "tool" && b.status === "running" ? { ...b, status } : b));
}

function ChatMarkdown({ text }: { text: string }) {
  const html = useMemo(() => markdownToHtml(text || ""), [text]);
  if (!html) {
    return <pre className="chat__text"> </pre>;
  }
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML from escaped markdown
    <div className="chat__md" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

type Props = {
  bundle: DebugBundle;
  settings: AppSettings;
};

export function ChatTab({ bundle, settings }: Props) {
  const inspectedId = bundle.session.id;
  const context = useMemo(() => compactDebugContext(bundle), [bundle]);
  const initial = useMemo(() => loadStore(inspectedId), [inspectedId]);
  const [bubbles, setBubbles] = useState<Bubble[]>(initial.bubbles);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [agentSessionId, setAgentSessionId] = useState<string | null>(initial.agentSessionId);
  const contextSentRef = useRef(initial.contextSent);
  const clientRef = useRef<AgentChatClient | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bubblesRef = useRef(bubbles);
  bubblesRef.current = bubbles;
  const agentSessionIdRef = useRef(agentSessionId);
  agentSessionIdRef.current = agentSessionId;

  const persist = useCallback(
    (nextBubbles: Bubble[], sid: string | null = agentSessionIdRef.current) => {
      saveStore(inspectedId, {
        agentSessionId: sid,
        contextSent: contextSentRef.current,
        bubbles: nextBubbles,
      });
    },
    [inspectedId],
  );

  useEffect(() => {
    persist(bubbles);
  }, [bubbles, persist]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || (bubbles.length === 0 && !busy)) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [bubbles, busy]);

  useEffect(() => {
    const baseUrl = settings.base_url.trim();
    if (!baseUrl) {
      setStatus("Set AgentForge URL in Settings");
      return;
    }
    const client = new AgentChatClient(baseUrl, settings.api_key, DEBUG_CHAT_SOURCE);
    const resumeId = agentSessionIdRef.current;
    if (resumeId) {
      client.setSessionId(resumeId);
    }
    clientRef.current = client;

    const unsub = client.on((ev: AgentChatEvent) => {
      switch (ev.type) {
        case "connected":
          setStatus(client.sessionId ? `Session ${client.sessionId.slice(0, 8)}…` : "Connected");
          break;
        case "disconnected":
          setStatus("Disconnected");
          setBusy(false);
          break;
        case "session.init":
          if (ev.sessionId) {
            setAgentSessionId(ev.sessionId);
            client.setSessionId(ev.sessionId);
            persist(bubblesRef.current, ev.sessionId);
          }
          setStatus(`Session ${ev.sessionId.slice(0, 8)}…`);
          break;
        case "agent.config":
          if (client.sessionId) {
            setAgentSessionId(client.sessionId);
          }
          setStatus(
            [ev.mode || DEBUG_CHAT_MODE, ev.profile, ev.model].filter(Boolean).join(" · ") ||
              "Running…",
          );
          break;
        case "tool.call":
          setBubbles((prev) => [
            ...markTools(prev, "done"),
            {
              id: uid(),
              role: "tool",
              name: (ev.name || "tool").trim() || "tool",
              status: "running",
            },
          ]);
          break;
        case "result.chunk": {
          const tok = ev.token;
          if (!tok) {
            break;
          }
          setBubbles((prev) => {
            const sid = streamIdRef.current;
            if (sid) {
              return prev.map((b) =>
                b.id === sid && b.role === "assistant"
                  ? { ...b, text: (b.text === "…" ? "" : b.text) + tok, streaming: true }
                  : b,
              );
            }
            const id = uid();
            streamIdRef.current = id;
            return [...prev, { id, role: "assistant", text: tok, streaming: true }];
          });
          break;
        }
        case "agent.result": {
          const finalText = ev.text || "";
          setBubbles((prev) => {
            const withTools = markTools(prev, "done");
            const sid = streamIdRef.current;
            streamIdRef.current = null;
            if (sid) {
              return withTools.map((b) =>
                b.id === sid && b.role === "assistant"
                  ? { ...b, text: finalText || b.text, streaming: false }
                  : b,
              );
            }
            return [...withTools, { id: uid(), role: "assistant", text: finalText || "(empty)" }];
          });
          setBusy(false);
          setStatus(ev.elapsed != null ? `Done (${ev.elapsed.toFixed(1)}s)` : "Done");
          break;
        }
        case "result.done":
          setBubbles((prev) =>
            prev.map((b) =>
              b.role === "assistant" && b.streaming ? { ...b, streaming: false } : b,
            ),
          );
          setBusy(false);
          break;
        case "agent.error":
          streamIdRef.current = null;
          setBubbles((prev) => [
            ...markTools(prev, "error"),
            { id: uid(), role: "system", text: `Error: ${ev.error}` },
          ]);
          setBusy(false);
          setStatus("Error");
          break;
        case "agent.cancelled":
          streamIdRef.current = null;
          setBubbles((prev) => [
            ...markTools(prev, "done"),
            { id: uid(), role: "system", text: "Cancelled" },
          ]);
          setBusy(false);
          setStatus("Cancelled");
          break;
        case "confirm.request": {
          const ok = window.confirm(ev.prompt);
          try {
            client.sendConfirm(ev.requestId, ok);
          } catch (e) {
            console.warn("confirm response failed", e);
          }
          break;
        }
        case "secret.request": {
          const value = window.prompt(ev.prompt || ev.label || "Secret required", "");
          try {
            client.sendSecret(ev.requestId, value);
          } catch (e) {
            console.warn("secret response failed", e);
          }
          break;
        }
        default:
          break;
      }
    });

    void client.connect(resumeId).catch((e) => {
      setStatus(e instanceof Error ? e.message : String(e));
    });

    return () => {
      unsub();
      client.disconnect();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [settings.base_url, settings.api_key, persist]);

  const newChat = useCallback(() => {
    if (busy) {
      return;
    }
    clientRef.current?.beginNewSession();
    contextSentRef.current = false;
    streamIdRef.current = null;
    setAgentSessionId(null);
    setBubbles([]);
    setBusy(false);
    setStatus("New chat");
    persist([], null);
    inputRef.current?.focus();
  }, [busy, persist]);

  const stop = useCallback(() => {
    clientRef.current?.sendCancel();
    setBusy(false);
    setStatus("Stopping…");
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) {
      return;
    }
    if (!settings.base_url.trim()) {
      setBubbles((prev) => [
        ...prev,
        { id: uid(), role: "system", text: "Set AgentForge URL in Settings" },
      ]);
      return;
    }
    setDraft("");
    setBusy(true);
    setStatus("Sending…");
    streamIdRef.current = null;

    const payload = wrapQueryWithContext(text, context, contextSentRef.current);
    setBubbles((prev) => {
      const next: Bubble[] = [
        ...prev,
        { id: uid(), role: "user", text },
        { id: uid(), role: "assistant", text: "…", streaming: true },
      ];
      const last = next[next.length - 1];
      streamIdRef.current = last.id;
      return next;
    });

    try {
      const client = clientRef.current;
      if (!client) {
        throw new Error("Chat client not ready");
      }
      const sid = agentSessionIdRef.current;
      if (sid) {
        client.setSessionId(sid);
      }
      await client.sendQuery(payload, { modePrefix: DEBUG_CHAT_MODE });
      contextSentRef.current = true;
      if (client.sessionId) {
        setAgentSessionId(client.sessionId);
        persist(bubblesRef.current, client.sessionId);
      }
      setStatus(
        client.sessionId ? `Session ${client.sessionId.slice(0, 8)}… · running` : "Running…",
      );
    } catch (e) {
      streamIdRef.current = null;
      setBusy(false);
      setStatus("Error");
      setBubbles((prev) => [
        ...prev.filter((b) => !(b.role === "assistant" && b.text === "…")),
        {
          id: uid(),
          role: "system",
          text: `Failed to send: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    }
  }, [draft, busy, settings.base_url, context, persist]);

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="chat">
      <header className="chat__head">
        <div className="chat__title">
          <strong>AI Chat</strong>
          <span className="chat__mode">{DEBUG_CHAT_MODE}</span>
          <span className="muted">
            {context.truncated ? "snapshot truncated" : "snapshot attached"}
          </span>
        </div>
        <button type="button" className="btn" onClick={newChat} disabled={busy}>
          New chat
        </button>
      </header>
      <div className="chat__status" role="status">
        {status}
      </div>
      <div className="chat__scroll" ref={scrollRef}>
        {bubbles.length === 0 ? (
          <p className="chat__hint">
            Ask about this session — e.g. why a tool call failed. Answers use the loaded Overview,
            Messages, Audit, and Logs snapshot only. Prefix @agent or @search if you want tools.
          </p>
        ) : (
          bubbles.map((b) => (
            <div
              key={b.id}
              className={
                b.role === "user"
                  ? "chat__bubble chat__bubble--user"
                  : b.role === "assistant"
                    ? "chat__bubble chat__bubble--assistant"
                    : b.role === "tool"
                      ? "chat__bubble chat__bubble--tool"
                      : "chat__bubble chat__bubble--system"
              }
            >
              <span className="chat__role">
                {b.role === "tool" ? `tool · ${b.name}` : b.role}
                {b.role === "tool" ? ` · ${b.status}` : ""}
                {b.role === "assistant" && b.streaming ? " · …" : ""}
              </span>
              {b.role === "tool" ? null : b.role === "user" ? (
                <pre className="chat__text">{b.text || " "}</pre>
              ) : (
                <ChatMarkdown text={b.text || (b.role === "assistant" ? "…" : "")} />
              )}
            </div>
          ))
        )}
      </div>
      <div className="chat__composer">
        <textarea
          ref={inputRef}
          className="chat__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKey}
          placeholder="Ask about this session"
          rows={3}
          disabled={busy}
        />
        <div className="chat__actions">
          {busy ? (
            <button type="button" className="btn" onClick={stop}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void send()}
              disabled={!draft.trim()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
