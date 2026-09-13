import { invoke } from "@tauri-apps/api/core";
import { parseDebugBundle } from "./debugContext";
import { parseSessionSummaries } from "./sessions";
import type { AppSettings, DebugBundle, SessionSummary } from "./types";

export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export async function setSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("set_settings", { settings });
}

export async function listSessions(source = "all"): Promise<SessionSummary[]> {
  const raw = await invoke<unknown>("list_sessions", { source });
  return parseSessionSummaries(raw);
}

export async function getDebugSession(sessionId: string): Promise<DebugBundle> {
  const raw = await invoke<unknown>("get_debug_session", { sessionId });
  const bundle = parseDebugBundle(raw);
  if (!bundle) {
    throw new Error("invalid debug session payload");
  }
  return bundle;
}
