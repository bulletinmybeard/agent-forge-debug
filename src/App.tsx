import { useCallback, useEffect, useState } from "react";
import { Picker } from "./components/Picker";
import { SessionView } from "./components/SessionView";
import { SettingsView } from "./components/SettingsView";
import { getDebugSession, getSettings, listSessions, setSettings } from "./lib/ipc";
import type { AppSettings, DebugBundle, SessionSummary } from "./lib/types";

type Screen = "picker" | "session" | "settings";

export default function App() {
  const [screen, setScreen] = useState<Screen>("picker");
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [bundle, setBundle] = useState<DebugBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reloadList = useCallback(async () => {
    setError(null);
    try {
      const rows = await listSessions("all");
      setSessions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const s = await getSettings();
        setSettingsState(s);
        await reloadList();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [reloadList]);

  async function openSession(id: string) {
    setLoading(true);
    setError(null);
    try {
      const next = await getDebugSession(id);
      setBundle(next);
      setScreen("session");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setScreen("picker");
    } finally {
      setLoading(false);
    }
  }

  if (screen === "settings" && settings) {
    return (
      <SettingsView
        initial={settings}
        onBack={() => setScreen("picker")}
        onSave={async (next) => {
          const saved = await setSettings(next);
          setSettingsState(saved);
          await reloadList();
        }}
      />
    );
  }

  if (screen === "session" && bundle) {
    return (
      <SessionView
        bundle={bundle}
        settings={settings ?? { base_url: "", api_key: "" }}
        onBack={() => setScreen("picker")}
      />
    );
  }

  return (
    <>
      {loading ? <div className="busy">Loading…</div> : null}
      <Picker
        sessions={sessions}
        error={error}
        onOpen={(id) => void openSession(id)}
        onSettings={() => setScreen("settings")}
        onReload={() => void reloadList()}
      />
    </>
  );
}
