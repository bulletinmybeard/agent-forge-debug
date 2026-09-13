/**
 * AgentForge /ws/chat client for Debug AI Chat.
 * Protocol mirrors Email AgentChatClient + web protocol.py.
 */

export const DEBUG_CHAT_SOURCE = "debug";
export const DEBUG_CHAT_MODE = "@chat";

export type AgentChatEvent =
  | { type: "session.init"; sessionId: string }
  | { type: "connected" }
  | { type: "disconnected"; code?: number; reason?: string }
  | { type: "result.chunk"; token: string }
  | { type: "result.done" }
  | { type: "agent.result"; text: string; elapsed?: number }
  | { type: "agent.error"; error: string }
  | { type: "agent.cancelled"; elapsed?: number }
  | { type: "agent.config"; profile?: string; model?: string; mode?: string }
  | { type: "tool.call"; name: string; args?: Record<string, unknown> }
  | { type: "confirm.request"; requestId: string; prompt: string }
  | { type: "secret.request"; requestId: string; label?: string; prompt?: string }
  | { type: "status"; message: string }
  | { type: "raw"; payload: Record<string, unknown> };

export type AgentChatListener = (event: AgentChatEvent) => void;

export function toWsChatUrl(
  httpBase: string,
  sessionId?: string | null,
  source = DEBUG_CHAT_SOURCE,
): string {
  const trimmed = httpBase.trim().replace(/\/+$/, "");
  const proto = trimmed.toLowerCase().startsWith("https") ? "wss" : "ws";
  const host = trimmed.replace(/^https?:\/\//i, "");
  const params = new URLSearchParams();
  if (source) {
    params.set("source", source);
  }
  if (sessionId) {
    params.set("session_id", sessionId);
  }
  const q = params.toString();
  return `${proto}://${host}/ws/chat${q ? `?${q}` : ""}`;
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `afd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class AgentChatClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<AgentChatListener>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly baseUrl: string;
  private apiKey: string;
  private readonly sessionSource: string;
  sessionId: string | null = null;

  constructor(baseUrl: string, apiKey = "", sessionSource = DEBUG_CHAT_SOURCE) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.sessionSource = sessionSource;
  }

  on(listener: AgentChatListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: AgentChatEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (e) {
        console.warn("agent chat listener error", e);
      }
    }
  }

  isOpen(): boolean {
    return this.ws != null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(resumeSessionId?: string | null): Promise<void> {
    if (this.isOpen()) {
      return Promise.resolve();
    }
    if (resumeSessionId) {
      this.sessionId = resumeSessionId;
    }
    const url = toWsChatUrl(this.baseUrl, this.sessionId, this.sessionSource);

    return new Promise((resolve, reject) => {
      try {
        const protocols = this.apiKey.trim().length > 0 ? [this.apiKey.trim()] : undefined;
        const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
        this.ws = ws;

        ws.onopen = () => {
          this.startPing();
          this.emit({ type: "connected" });
          resolve();
        };
        ws.onerror = () => {
          /* onclose follows */
        };
        ws.onclose = (ev) => {
          this.stopPing();
          this.ws = null;
          this.emit({
            type: "disconnected",
            code: ev.code,
            reason: ev.reason,
          });
        };
        ws.onmessage = (ev) => {
          this.handleRaw(String(ev.data ?? ""));
        };

        window.setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            try {
              ws.close();
            } catch {
              /* ignore */
            }
            reject(new Error("AgentForge WebSocket connect timeout"));
          }
        }, 15_000);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  private handleRaw(raw: string): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const t = String(payload.type || "");
    switch (t) {
      case "session.init": {
        const sid = String(payload.session_id || payload.sessionId || "");
        if (sid) {
          this.sessionId = sid;
        }
        this.emit({ type: "session.init", sessionId: this.sessionId || sid });
        break;
      }
      case "result.chunk":
      case "stream_token":
        this.emit({
          type: "result.chunk",
          token: String(payload.token ?? payload.text ?? ""),
        });
        break;
      case "result.done":
      case "stream_done":
        this.emit({ type: "result.done" });
        break;
      case "agent.result":
      case "result":
        this.emit({
          type: "agent.result",
          text: String(payload.text ?? payload.content ?? ""),
          elapsed: typeof payload.elapsed === "number" ? payload.elapsed : undefined,
        });
        break;
      case "agent.error":
        this.emit({
          type: "agent.error",
          error: String(payload.error ?? payload.message ?? "agent error"),
        });
        break;
      case "agent.cancelled":
        this.emit({
          type: "agent.cancelled",
          elapsed: typeof payload.elapsed === "number" ? payload.elapsed : undefined,
        });
        break;
      case "agent.config":
        this.emit({
          type: "agent.config",
          profile: payload.profile != null ? String(payload.profile) : undefined,
          model: payload.model != null ? String(payload.model) : undefined,
          mode: payload.mode != null ? String(payload.mode) : undefined,
        });
        if (payload.session_id) {
          this.sessionId = String(payload.session_id);
        }
        break;
      case "tool.call":
        this.emit({
          type: "tool.call",
          name: String(payload.name || "tool"),
          args:
            payload.args && typeof payload.args === "object"
              ? (payload.args as Record<string, unknown>)
              : undefined,
        });
        break;
      case "confirm.request":
        this.emit({
          type: "confirm.request",
          requestId: String(payload.request_id || ""),
          prompt: String(payload.prompt || "Confirm this action?"),
        });
        break;
      case "secret.request":
        this.emit({
          type: "secret.request",
          requestId: String(payload.request_id || ""),
          label: payload.label != null ? String(payload.label) : undefined,
          prompt: payload.prompt != null ? String(payload.prompt) : undefined,
        });
        break;
      default:
        this.emit({ type: "raw", payload });
        break;
    }
  }

  private send(obj: Record<string, unknown>): void {
    if (!this.isOpen() || !this.ws) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(JSON.stringify(obj));
  }

  async ensureConnected(): Promise<void> {
    if (!this.isOpen()) {
      await this.connect(this.sessionId);
    }
  }

  async sendQuery(
    text: string,
    opts?: { modePrefix?: string; provider?: string | null },
  ): Promise<void> {
    await this.ensureConnected();
    const mode = (opts?.modePrefix ?? DEBUG_CHAT_MODE).trim();
    let body = text.trim();
    if (mode && !body.startsWith("@")) {
      body = `${mode} ${body}`;
    }
    if (!this.sessionId) {
      this.sessionId = newSessionId();
    }
    const provider = (opts?.provider || "").trim();
    const overrides: Record<string, string> = {
      source: this.sessionSource,
    };
    if (provider) {
      overrides.provider = provider;
    }
    this.send({
      type: "query",
      text: body,
      session_id: this.sessionId,
      overrides,
    });
  }

  sendCancel(): void {
    if (!this.isOpen()) {
      return;
    }
    this.send({ type: "cancel" });
  }

  sendConfirm(requestId: string, confirmed: boolean): void {
    this.send({
      type: "confirm.response",
      request_id: requestId,
      confirmed,
    });
  }

  sendSecret(requestId: string, value: string | null): void {
    if (value == null) {
      this.send({
        type: "secret.response",
        request_id: requestId,
        cancelled: true,
      });
      return;
    }
    this.send({
      type: "secret.response",
      request_id: requestId,
      value,
    });
  }

  beginNewSession(): void {
    try {
      if (this.isOpen()) {
        this.sendCancel();
      }
    } catch {
      /* ignore */
    }
    this.disconnect();
    this.sessionId = null;
  }

  setSessionId(id: string | null): void {
    this.sessionId = id?.trim() || null;
  }

  disconnect(): void {
    this.stopPing();
    try {
      this.ws?.close(1000, "bye");
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (!this.isOpen()) {
        return;
      }
      try {
        this.send({ type: "ping" });
      } catch {
        /* ignore */
      }
    }, 25_000);
  }

  private stopPing(): void {
    if (this.pingTimer != null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
