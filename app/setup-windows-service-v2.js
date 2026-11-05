// Register Kanflow Ver2 (the PostgreSQL line, run alongside v1 until v1 is detached) as its own Windows Service via
// node-windows. Used only in the Ver2 instance folder D:\APP\KanflowV2 (docs/operations/mysql-to-pg-cutover.md,
// "Ver2 を別に立ち上げてから切り離す形"). Run as administrator — normally through ops\ver2\open-ver2.ps1:
//   cd D:\APP\KanflowV2\app
//   node setup-windows-service-v2.js            (install + start)
//   node setup-windows-service-v2.js --uninstall
//   node setup-windows-service-v2.js --port 3000  (Ver2 on v1's URL after the detach)
//
// Display name "KanflowV2" (service id "kanflowv2.exe"), port 3300. Its wrapper and logs live in
// <instance>\ops\web-v2\daemon — separate from v1's "Kanflow" service (kanflow.exe, port 3000), which this script
// never touches. The wrapper runs node_modules\next\dist\bin\next: stop the service before `npm ci`.

const fs = require("fs")
const path = require("path")
const { Service } = require("node-windows")

// --port <n> (default 3300): 3000 once Ver2 replaces v1 on v1's URL (v1's "Kanflow" service stopped first).
function portArg(argv) {
  const i = argv.indexOf("--port")
  if (i === -1) return 3300
  const n = Number(argv[i + 1])
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(`[ERROR] --port needs a port number (got "${argv[i + 1] ?? ""}")`)
    process.exit(1)
  }
  return n
}
const PORT = portArg(process.argv)

const APP_DIR = __dirname
const NEXT_BIN = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "next")
const WRAPPER_ROOT = path.resolve(APP_DIR, "..", "ops", "web-v2")

const svc = new Service({
  name: "KanflowV2",
  description: `Kanflow Ver2 (PostgreSQL, port ${PORT})`,
  script: NEXT_BIN,
  scriptOptions: `start -H 0.0.0.0 -p ${PORT}`,
  workingDirectory: APP_DIR,
  env: [{ name: "NODE_ENV", value: "production" }],
  // Crash-restart policy as for v1's service.
  wait: 2,
  grow: 0.5,
  maxRetries: 1000,
})
// node-windows creates only the last folder (<root>\daemon); a fresh instance has no ops\web-v2 yet.
fs.mkdirSync(WRAPPER_ROOT, { recursive: true })
svc.directory(WRAPPER_ROOT)

svc.on("error", (e) => {
  console.error("[ERROR]", e)
  process.exitCode = 1
})

if (process.argv.includes("--uninstall")) {
  svc.on("uninstall", () => console.log("[OK] Service 'KanflowV2' uninstalled."))
  svc.uninstall()
} else {
  svc.on("install", () => {
    console.log("[OK] Service 'KanflowV2' installed. Starting...")
    svc.start()
  })
  svc.on("alreadyinstalled", () => {
    console.log("[INFO] Service 'KanflowV2' already installed. Starting...")
    svc.start()
  })
  svc.on("start", () => console.log(`[OK] Service 'KanflowV2' started on port ${PORT}.`))
  svc.install()
}
