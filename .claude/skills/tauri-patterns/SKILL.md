---
name: tauri-patterns
description: Tauri 2.x desktop-app discipline — IPC trust boundary, command error handling, capability/permission scoping, state and lock rules, events vs channels, sidecars, updater and Windows packaging, layered test strategy. Use when: building, reviewing, or debugging a Tauri desktop tool (src-tauri/ present, invoke() calls, tauri.conf.json, capabilities/*.json). Do not use when: general Rust design questions (rust-patterns), 3D viewer/render-loop code inside the webview (3d-graphics-patterns), or pure web UI with no Rust core (frontend-patterns).
origin: project
---

# Tauri 2.x Desktop Application Patterns

A Tauri app splits into an untrusted webview frontend and a trusted Rust core. Every rule
here follows from that trust boundary: validate on the Rust side, grant least privilege,
never panic in a command.

## Related (read first)

- `tauri-reviewer` agent — reviews src-tauri commands, capability scoping, and the IPC
  boundary; pair with `rust-reviewer` / `typescript-reviewer` per side.
- `pre:edit:tauri-capability-check` hook — gates edits to `capabilities/*.json` for
  least-privilege; expect it to fire and justify any broadened grant.
- `rust-patterns` (core Rust design), `hardware-data-stream-handler` (high-frequency
  stream discipline the channel rules below inherit).

## Layout and Errors

- `main.rs` stays thin (calls `<app>_lib::run()`); all logic in `lib.rs` and below so it
  is testable with `cargo test`. Commands grouped in domain modules under `src/commands/`;
  per-window permission grants in `src-tauri/capabilities/*.json`.
- No `unwrap()`/`expect()` inside a command — a panic surfaces as an opaque IPC failure.
  Return `Result` with a `thiserror` enum that implements `Serialize` (string form).
  Startup-only `expect` on the builder `.run()` is acceptable.
- Error strings reach the frontend: never leak absolute paths, SQL, or stack traces in
  them; log detail on the Rust side instead.

## IPC Security (frontend is untrusted)

- Any webview JS can call any registered command with arbitrary arguments — validate every
  input (paths, IDs, sizes) on the Rust side before use.
- Path inputs: reject separators and `..`, resolve against an app-scoped dir
  (`app.path().app_data_dir()`), then canonicalize and verify the result stays inside it.
- Design commands as intents (`export_report(report_id)`), not primitives
  (`write_file(path, bytes)`). Never expose an admin command and rely on the frontend
  "not calling it".

## Capabilities (least privilege)

- Enumerate specific permissions per window; `core:default` is prototype-only — for
  release, list exactly what the window uses.
- No wildcard fs scopes (`**`, `$HOME/**`); scope to `$APPDATA`/`$APPCONFIG` subtrees.
- A window rendering remote/untrusted content gets an empty or near-empty capability set.
- Shell plugin = command-injection surface: only pre-declared commands with fixed program
  and regex-validated args in the capability file; never interpolate user input into a
  shell string. URL/file opening uses `tauri-plugin-opener`, not shell.
- Prefer dialog-picked paths (`tauri-plugin-dialog` extends fs scope at runtime) over
  free-form path input.

## State and Locks

- Shared state via `.manage()` / `State<'_, T>`. Selection: internally-synchronized types
  (e.g. `sqlx` pool) as-is; read-mostly → `std::sync::RwLock`; guard held across `.await`
  → `tokio::sync::Mutex`. Never hold a `std::sync` guard across `.await` — clone out,
  drop the guard. Async commands taking `State` must return `Result` (Tauri constraint).

## Events vs Channels

| Traffic | Mechanism |
|---------|-----------|
| Low-frequency broadcast (job done, settings changed) | Events (`emit`/`listen`) — always unlisten on unmount |
| High-frequency point-to-point stream (progress, telemetry, log tail) | `tauri::ipc::Channel` — ordered, cheaper; throttle UI updates |

## Sidecars, Updater, Packaging

- Sidecars: declare under `bundle.externalBin` (binary named `app-$TARGET_TRIPLE`), grant
  execute permission for that sidecar only. Kill children on `RunEvent::ExitRequested` —
  orphaned processes are the top sidecar bug.
- Windows targets: NSIS for per-user, no-admin, delta-friendly installs (default); MSI
  only when enterprise GPO deployment requires it. Unsigned builds trip SmartScreen —
  sign via `signtool` or a `signCommand` hook. The updater keypair (`tauri signer
  generate`) is separate from Authenticode; the private key is a CI secret, never committed.

## Test Strategy (by layer)

1. Rust logic: thin command bodies delegating to plain functions under `cargo test`
   (the 80% coverage floor applies here).
2. Frontend units: `mockIPC` from `@tauri-apps/api/mocks`; unmocked commands throw loudly.
3. E2E: `tauri-driver` + WebDriver against the built binary (Windows/Linux only).

## Review Checklist

- [ ] No `unwrap()`/`expect()` in commands; errors are `Serialize`-able `thiserror` types
- [ ] Every command validates its arguments on the Rust side; path inputs canonicalized and scoped
- [ ] Capabilities enumerate specific permissions; no `**` fs scopes; `core:default` justified
- [ ] No shell string built from frontend input; shell/sidecar args capability-validated
- [ ] Locks not held across `.await`; async `State` commands return `Result`
- [ ] High-frequency streams use channels with throttled rendering; event listeners cleaned up
- [ ] Sidecars terminated on exit; updater key and signing certs are secrets, not in the repo
