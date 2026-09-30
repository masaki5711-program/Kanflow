/**
 * Plain-JavaScript launcher for the Windows service (ops/worker/install-worker-service.js).
 *
 * It loads the PRE-BUILT worker bundle `<app>/.next/worker/main.cjs`
 * (produced by `npm run build:worker`, swapped into place together with the
 * web build by ops/deploy/swap-build.ps1). TypeScript sources and tsx are
 * never loaded at runtime, so a half-edited src/ tree or a dev-only
 * `npm install` cannot change what the service runs.
 *
 * node-windows forks ONE node process on this file; the bundle runs in that
 * same process, so the wrapper's IPC "shutdown" message / signals reach it.
 *
 *   node src/worker/service-entry.mjs [--dry-run]
 *
 * KANFLOW_WORKER_BUNDLE (optional) overrides the bundle path (absolute, or
 * relative to the app directory) - e.g. to test .next-new/worker/main.cjs.
 */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const override = process.env.KANFLOW_WORKER_BUNDLE?.trim()
const bundle = path.resolve(APP_DIR, override || path.join(".next", "worker", "main.cjs"))

if (!fs.existsSync(bundle)) {
  process.stderr.write(
    `kanflow-worker: bundle not found: ${bundle}\n` +
      "  Build it:  cd app && npm run build && npm run build:worker   (or the deploy script)\n" +
      "  Dev only:  npm run worker   (runs the TypeScript sources through tsx)\n"
  )
  process.exit(1)
}

// The bundle ships a linked source map: keep stack traces pointing at src/.
process.setSourceMapsEnabled(true)
createRequire(import.meta.url)(bundle)
