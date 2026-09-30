// Register the Kanflow background worker as a Windows Service (node-windows).
//
// Service name: kanflow-worker (display name). node-windows registers it with
//               the SCM as "kanflowworker.exe" (non-word chars stripped).
// Daemon files: ops\worker\daemon\ (winsw exe/xml + wrapper logs)
// Runs:         node app\src\worker\service-entry.mjs   (cwd = app\)
//               -> loads the PRE-BUILT bundle app\.next\worker\main.cjs
//                  (npm run build:worker; swapped with the web build by
//                  ops\deploy\swap-build.ps1). No TypeScript / tsx at runtime.
//               = translation queue worker + scheduled AI surveillance
//               (see docs\operations\worker.md)
//
// Graceful stop: `stopparentfirst` makes the node-windows wrapper send an IPC
// "shutdown" message instead of killing the process; the worker aborts the
// in-flight translation (rows go back to pending), releases its MySQL lock
// and exits within WORKER_SHUTDOWN_TIMEOUT_MS (default 25 s, < stoptimeout).
//
// Run as administrator:
//   cd D:\APP\Kanflow
//   node ops\worker\install-worker-service.js
//
// Before installing, check the configuration without touching the DB:
//   cd D:\APP\Kanflow\app && node src\worker\service-entry.mjs --dry-run

const path = require("path")
const fs = require("fs")

const APP_DIR = path.resolve(__dirname, "..", "..", "app")
const ENTRY = path.join(APP_DIR, "src", "worker", "service-entry.mjs")
const BUNDLE = path.join(APP_DIR, ".next", "worker", "main.cjs")
const NODE_WINDOWS = path.join(APP_DIR, "node_modules", "node-windows")

const missing = [
  [ENTRY, "app\\src\\worker\\service-entry.mjs (repo checkout incomplete?)"],
  [BUNDLE, "worker bundle - build it: cd app && npm run build:worker (after next build), or deploy with ops\\deploy\\deploy.ps1"],
  [path.join(NODE_WINDOWS, "package.json"), "node-windows - app\\node_modules is incomplete (npm ci during a maintenance window)"],
].filter(([file]) => !fs.existsSync(file))
if (missing.length > 0) {
  for (const [file, hint] of missing) console.error("[ERROR] missing " + file + "\n        " + hint)
  process.exit(2)
}

const { Service } = require(NODE_WINDOWS)

const svc = new Service({
  name: "kanflow-worker",
  description: "Kanflow background worker: JA/ID translation queue + scheduled AI surveillance",
  script: ENTRY,
  workingDirectory: APP_DIR,
  env: [{ name: "NODE_ENV", value: "production" }],
  // Graceful shutdown over IPC; must exceed WORKER_SHUTDOWN_TIMEOUT_MS (25 s).
  stopparentfirst: true,
  stoptimeout: 35,
  // Crash-restart policy (same as the Kanflow web service).
  wait: 2,
  grow: 0.5,
  maxRetries: 1000,
})

// Keep the winsw daemon files in ops\worker\daemon, not under app\src\worker.
svc.directory(__dirname)

svc.on("install", () => {
  console.log("[OK] Service 'kanflow-worker' installed. Starting...")
  svc.start()
})

svc.on("alreadyinstalled", () => {
  console.log("[INFO] Service 'kanflow-worker' already installed. Starting...")
  svc.start()
})

svc.on("start", () => {
  console.log("[OK] Service 'kanflow-worker' started.")
  console.log("     Verify with: sc query kanflowworker.exe")
  console.log("     Heartbeat:   app\\logs\\worker-heartbeat.json (rewritten every 60 s; /api/health -> worker)")
  console.log("     Logs:        app\\logs\\worker-YYYY-MM-DD.log, " + svc.root)
})

svc.on("error", (err) => {
  console.error("[ERROR]", err)
  process.exit(1)
})

svc.on("invalidinstallation", (err) => {
  console.error("[ERROR] Invalid installation:", err)
  process.exit(1)
})

console.log("Installing 'kanflow-worker' as Windows Service...")
console.log("  Script: ", ENTRY, "->", BUNDLE)
console.log("  CWD:    ", APP_DIR)
console.log("")

svc.install(__dirname)
