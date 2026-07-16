// Uninstall the Kanflow Windows Service registered by setup-windows-service.js.
//
// Run as administrator:
//   cd D:\APP\Kanflow\app
//   node uninstall-windows-service.js

const path = require("path")
const { Service } = require("node-windows")

const APP_DIR = __dirname
const NEXT_BIN = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "next")

const svc = new Service({
  name: "Kanflow",
  script: NEXT_BIN,
  workingDirectory: APP_DIR,
})

svc.on("uninstall", () => {
  console.log("[OK] Service 'Kanflow' uninstalled.")
})

svc.on("error", (err) => {
  console.error("[ERROR]", err)
  process.exit(1)
})

console.log("Uninstalling 'Kanflow' Windows Service...")
svc.uninstall()
