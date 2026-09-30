// Uninstall the Kanflow Windows Service registered by setup-windows-service.js.
//
// Run as administrator:
//   cd D:\APP\Kanflow\app
//   node uninstall-windows-service.js            wrapper in ops\web\daemon (current layout)
//   node uninstall-windows-service.js --legacy   wrapper in node_modules\next\dist\bin\daemon (old layout)
//
// Without a flag the script picks whichever location holds kanflow.xml
// (the new one first). ops\web\migrate-service-wrapper.ps1 uses --legacy.

const fs = require("fs")
const path = require("path")
const { Service } = require("node-windows")

const APP_DIR = __dirname
const NEXT_BIN = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "next")
const NEW_ROOT = path.resolve(APP_DIR, "..", "ops", "web")
const LEGACY_ROOT = path.join(APP_DIR, "node_modules", "next", "dist", "bin")

function pickRoot() {
  if (process.argv.includes("--legacy")) return LEGACY_ROOT
  if (process.argv.includes("--new")) return NEW_ROOT
  if (fs.existsSync(path.join(NEW_ROOT, "daemon", "kanflow.xml"))) return NEW_ROOT
  if (fs.existsSync(path.join(LEGACY_ROOT, "daemon", "kanflow.xml"))) return LEGACY_ROOT
  return NEW_ROOT
}

const svc = new Service({
  name: "Kanflow",
  script: NEXT_BIN,
  workingDirectory: APP_DIR,
})
svc.directory(pickRoot())

svc.on("uninstall", () => {
  console.log("[OK] Service 'Kanflow' uninstalled (wrapper dir " + svc.root + ").")
})

svc.on("error", (err) => {
  console.error("[ERROR]", err)
  process.exit(1)
})

console.log("Uninstalling 'Kanflow' Windows Service (wrapper dir " + svc.root + ")...")
svc.uninstall()
