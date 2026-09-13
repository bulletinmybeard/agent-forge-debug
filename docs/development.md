# Development

Frontend is Vite + React 19 + TypeScript. Native shell is Tauri 2 (Rust). Lint/format is Biome.

## Layout

| Path | Role |
|------|------|
| `src/` | React UI, IPC wrappers, chat/markdown helpers |
| `src/lib/*.test.ts` | Node test runner coverage |
| `src-tauri/` | Rust commands, settings, HTTP client, bundle config |
| `scripts/build-app.sh` | Release `.app` into `/Applications` |
| `public/` | Static assets served by Vite |

`src-tauri/target/`, `src-tauri/gen/`, `dist/`, and `node_modules/` are build output. Do not commit them.

## Commands

```bash
npm install
npm run tauri dev      # Vite on :1420 + Tauri window
npm run typecheck
npm test
npm run check          # Biome
npm run build          # frontend only (`tsc` + Vite)
npm run tauri build    # signed-off release bundle under src-tauri/target/release/bundle/
```

Unsigned local install:

```bash
scripts/build-app.sh
xattr -dr com.apple.quarantine "/Applications/AgentForge Debug.app"
```

Writing to `/Applications` may need `sudo`.

## Architecture

```
React UI -- invoke --> Tauri commands -- HTTPS + optional Bearer --> AgentForge
                              |
                              +-- settings.json in app config dir
Chat tab -- WebSocket /ws/chat (source=debug) --> AgentForge
```

Rust owns settings I/O and the two GET endpoints. The WebSocket chat client runs in the webview.

## Tests

`npm test` runs `src/lib/*.test.ts` with `node --experimental-strip-types --test`. Those files are excluded from `tsc` (`tsconfig.json`).
