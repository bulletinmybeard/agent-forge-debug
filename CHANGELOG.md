# Changelog

All notable changes to **AgentForge Debug** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-13

First release of the native macOS inspector for [AgentForge](https://github.com/bulletinmybeard/agent-forge).

Needs [AgentForge](https://github.com/bulletinmybeard/agent-forge) **[≥ 0.16.0](https://github.com/bulletinmybeard/agent-forge/releases/tag/v0.16.0)** for `GET /api/sessions`, `GET /api/debug/sessions/{id}`, and Chat over `/ws/chat`.

### Added

- Tauri 2 + React 19 + Vite 8 desktop app (macOS 11+)
- Session picker: source, date range, session dropdown, and UUID jump
- Overview, Messages, Audit, and Logs tabs for a loaded debug snapshot
- Chat tab (`source=debug`) that asks AgentForge about the loaded snapshot
- Settings: AgentForge URL and optional Bearer API key, stored in the app config dir
- HTTP client timeouts (10s connect / 30s request) and a Content Security Policy
- GitHub Actions: CI (Biome, typecheck, tests, frontend build, Cargo check), release notes from this file, Gitleaks on pull requests
