import { useState } from "react";
import type { AppSettings } from "../lib/types";

type Props = {
  initial: AppSettings;
  onSave: (next: AppSettings) => Promise<void>;
  onBack: () => void;
};

export function SettingsView({ initial, onSave, onBack }: Props) {
  const [baseUrl, setBaseUrl] = useState(initial.base_url);
  const [apiKey, setApiKey] = useState(initial.api_key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave({ base_url: baseUrl, api_key: apiKey });
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings">
      <header className="chrome">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <h1>Settings</h1>
      </header>
      <div className="settings__form">
        <label>
          AgentForge URL
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://agentforge.example.com"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label>
          API key (optional)
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="leave empty if auth is off"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        {error ? <p className="banner banner--error">{error}</p> : null}
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
    </div>
  );
}
