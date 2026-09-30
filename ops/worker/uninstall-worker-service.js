// Uninstall the kanflow-worker Windows Service registered by install-worker-service.js.
//
// Run as administrator:
//   cd D:\APP\Kanflow
//   node ops\worker\uninstall-worker-service.js
//
// NOTE: with the worker removed, translations stop unless the web service
// runs the loop itself (AI_TRANSLATION_WORKER=inprocess in app\.env, then
// restart the Kanflow service). See docs\operations\worker.md.

const path = require("path")

const APP_DIR = path.resolve(__dirname, "..", "..", "app")
const ENTRY = path.join(APP_DIR, "src", "worker", "service-entry.mjs")
const { Service } = require(path.join(APP_DIR, "node_modules", "node-windows"))

const svc = new Service({
  name: "kanflow-worker",
  script: ENTRY,
  workingDirectory: APP_DIR,
})

// Same daemon directory as install-worker-service.js.
svc.directory(__dirname)

svc.on("uninstall", () => {
  console.log("[OK] Service 'kanflow-worker' uninstalled.")
})

svc.on("error", (err) => {
  console.error("[ERROR]", err)
  process.exit(1)
})

console.log("Uninstalling 'kanflow-worker' Windows Service...")
svc.uninstall()
