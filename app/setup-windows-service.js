// Register Kanflow as a Windows Service via node-windows.
//
// node-windows installs a small daemon wrapper (kanflow.exe + kanflow.xml,
// winsw) that the Windows Service Control Manager supervises. The daemon then
// spawns `node <script>`, watches it, and restarts on crash with exponential
// backoff.
//
// Why this instead of schtasks / pm2-windows-service:
//   - schtasks under corporate Group Policy could not actually run as
//     SYSTEM and got ^C events from user-session activity.
//   - pm2-windows-service is deprecated and its CLI is not registered on
//     PATH after `npm install -g` on this host.
//   - node-windows is maintained, installs locally, and produces a real
//     Windows Service that runs as LocalSystem with no console attachment.
//
// Run as administrator:
//   cd D:\APP\Kanflow\app
//   node setup-windows-service.js
//
// Service id "kanflow.exe" (display name "Kanflow"). The wrapper + its logs
// live in D:\APP\Kanflow\ops\web\daemon\ - OUTSIDE node_modules, so `npm ci`
// or a `next` upgrade no longer deletes them. (Older installs kept them in
// node_modules\next\dist\bin\daemon\; move with ops\web\migrate-service-wrapper.ps1.)
// The wrapper still runs node_modules\node-windows\lib\wrapper.js and
// node_modules\next\dist\bin\next, so stop the service before `npm ci`.
// Robust restart: recover.bat (repo root). Watchdog: ops/watchdog/.

const fs = require("fs")
const path = require("path")
const { Service } = require("node-windows")

const APP_DIR = __dirname
const NEXT_BIN = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "next")
// node-windows appends "daemon": files go to <WRAPPER_ROOT>\daemon.
const WRAPPER_ROOT = path.resolve(APP_DIR, "..", "ops", "web")
const LEGACY_XML = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "daemon", "kanflow.xml")

if (fs.existsSync(LEGACY_XML) && !process.argv.includes("--ignore-legacy")) {
  console.error("[ERROR] The service wrapper is still installed in the OLD location:")
  console.error("        " + path.dirname(LEGACY_XML))
  console.error("        Migrate it (stop, uninstall old, install here, verify, rollback on failure):")
  console.error("        powershell -NoProfile -ExecutionPolicy Bypass -File D:\\APP\\Kanflow\\ops\\web\\migrate-service-wrapper.ps1")
  process.exit(2)
}

const svc = new Service({
  name: "Kanflow",
  description: "Kanflow Agile Project Management Tool (Next.js, port 3000)",
  script: NEXT_BIN,
  scriptOptions: "start -H 0.0.0.0 -p 3000",
  workingDirectory: APP_DIR,
  env: [
    { name: "NODE_ENV", value: "production" },
  ],
  // Crash-restart policy
  // wait: initial backoff in seconds
  // grow: multiplier per attempt (1.0 = constant, 0.5 = grows 50% per retry)
  // maxRetries: cap; null/large value means effectively never give up
  wait: 2,
  grow: 0.5,
  maxRetries: 1000,
})

svc.directory(WRAPPER_ROOT)

svc.on("install", () => {
  console.log("[OK] Service 'Kanflow' installed. Starting...")
  svc.start()
})

svc.on("alreadyinstalled", () => {
  console.log("[INFO] Service 'Kanflow' already installed. Starting...")
  svc.start()
})

svc.on("start", () => {
  console.log("[OK] Service 'Kanflow' started.")
  console.log("     Verify with: sc query kanflow.exe   (service id; display name \"Kanflow\")")
  console.log("     URL:         http://localhost:3000/")
  console.log("     Wrapper:     " + svc.root)
})

svc.on("error", (err) => {
  console.error("[ERROR]", err)
  process.exit(1)
})

svc.on("invalidinstallation", (err) => {
  console.error("[ERROR] Invalid installation:", err)
  process.exit(1)
})

console.log("Installing 'Kanflow' as Windows Service...")
console.log("  Script:  ", NEXT_BIN)
console.log("  Args:    start -H 0.0.0.0 -p 3000")
console.log("  CWD:     ", APP_DIR)
console.log("  Wrapper: ", svc.root)
console.log("")

svc.install()
