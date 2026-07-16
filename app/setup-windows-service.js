// Register Kanflow as a Windows Service via node-windows.
//
// node-windows installs a small daemon wrapper (kanflow.exe + kanflow.xml
// under %APPDATA%\node-windows or similar) that the Windows Service Control
// Manager supervises. The daemon then spawns `node <script>`, watches it,
// and restarts on crash with exponential backoff.
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

const path = require("path")
const { Service } = require("node-windows")

const APP_DIR = __dirname
const NEXT_BIN = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "next")

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
  console.log("     Verify with: sc query Kanflow")
  console.log("     URL:         http://localhost:3000/")
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
console.log("")

svc.install()
