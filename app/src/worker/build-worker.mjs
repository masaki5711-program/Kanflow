/**
 * Bundle the standalone worker (src/worker/main.ts) into ONE CommonJS file
 * so the production service never runs TypeScript sources through tsx.
 *
 *   npm run build:worker                        -> .next/worker/main.cjs
 *   NEXT_DIST_DIR=.next-new npm run build:worker -> .next-new/worker/main.cjs
 *
 * Run it AFTER `next build` with the same NEXT_DIST_DIR: `next build` empties
 * its dist dir, and keeping the bundle inside it makes ops/deploy/swap-build.ps1
 * swap web build and worker bundle together (one BUILD_ID, one rollback).
 *
 * - Every file under src/ (incl. the generated Prisma client in src/generated)
 *   is bundled; "@/..." is resolved through tsconfig.json "paths".
 * - Packages from node_modules stay external (native / wasm / adapter code is
 *   loaded from app/node_modules at runtime, exactly like `next start`).
 *   The build FAILS if the bundle needs a package that is not a production
 *   dependency - direct, or transitive and not marked dev-only in
 *   package-lock.json (devDependencies such as tsx must never be needed at runtime).
 * - The web BUILD_ID found in the same dist dir is inlined (heartbeat file /
 *   BUILD_INFO.json), so ops can check both halves come from one build.
 * - `import.meta.url` (used by the generated Prisma client) is mapped to the
 *   bundle's own file URL.
 */
import { build } from "esbuild"
import { builtinModules, createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const DIST_DIR = path.resolve(APP_DIR, process.env.NEXT_DIST_DIR?.trim() || ".next")
const OUT_DIR = path.join(DIST_DIR, "worker")
const OUT_FILE = path.join(OUT_DIR, "main.cjs")
const ENTRY = path.join(APP_DIR, "src", "worker", "main.ts")

const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, "package.json"), "utf8"))
const prodDeps = new Set(Object.keys(pkg.dependencies ?? {}))
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])

function readLockPackages() {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_DIR, "package-lock.json"), "utf8")).packages ?? {}
  } catch {
    return {}
  }
}
const lockPackages = readLockPackages()

/** A direct production dependency, or a transitive one the lockfile does not mark dev-only. */
function isProductionPackage(name) {
  if (prodDeps.has(name)) return true
  const entry = lockPackages[`node_modules/${name}`]
  return Boolean(entry) && entry.dev !== true && entry.devOptional !== true
}

/** "@scope/name/sub" -> "@scope/name", "name/sub" -> "name". */
export function packageName(spec) {
  const parts = spec.split("/")
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

function fail(msg) {
  process.stderr.write(`build:worker FAILED: ${msg}\n`)
  process.exit(1)
}

function checkExternals(metafile) {
  const req = createRequire(path.join(APP_DIR, "package.json"))
  const problems = []
  const used = new Set()
  for (const output of Object.values(metafile.outputs)) {
    for (const imp of output.imports ?? []) {
      if (!imp.external || builtins.has(imp.path)) continue
      used.add(packageName(imp.path))
    }
  }
  for (const name of used) {
    if (!isProductionPackage(name)) problems.push(`${name} is not a production dependency (devDependencies must not be needed at runtime)`)
    try {
      req.resolve(`${name}/package.json`)
    } catch {
      try {
        req.resolve(name)
      } catch {
        problems.push(`${name} cannot be resolved from ${APP_DIR}`)
      }
    }
  }
  return { used: [...used].sort(), problems }
}

function readBuildId() {
  try {
    return fs.readFileSync(path.join(DIST_DIR, "BUILD_ID"), "utf8").trim()
  } catch {
    return null
  }
}

async function main() {
  if (!fs.existsSync(ENTRY)) fail(`entry not found: ${ENTRY}`)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const webBuildId = readBuildId()
  const result = await build({
    entryPoints: [ENTRY],
    outfile: OUT_FILE,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    packages: "external",
    tsconfig: path.join(APP_DIR, "tsconfig.json"),
    define: {
      "import.meta.url": "__kanflowImportMetaUrl",
      // Reported in the worker heartbeat so ops can see web + worker come from the same build.
      "process.env.KANFLOW_WORKER_WEB_BUILD_ID": JSON.stringify(webBuildId),
    },
    banner: { js: 'const __kanflowImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
    sourcemap: "linked",
    legalComments: "none",
    logLevel: "warning",
    metafile: true,
  })
  if (result.errors.length > 0) fail(`${result.errors.length} esbuild error(s)`)
  const { used, problems } = checkExternals(result.metafile)
  if (problems.length > 0) fail(problems.join("; "))
  const info = {
    builtAt: new Date().toISOString(),
    webBuildId,
    node: process.version,
    entry: "src/worker/main.ts",
    externals: used,
    bytes: fs.statSync(OUT_FILE).size,
  }
  fs.writeFileSync(path.join(OUT_DIR, "BUILD_INFO.json"), `${JSON.stringify(info, null, 2)}\n`)
  process.stdout.write(`build:worker OK -> ${path.relative(APP_DIR, OUT_FILE)} (${info.bytes} bytes, webBuildId ${info.webBuildId ?? "none"})\n`)
  process.stdout.write(`  externals: ${used.join(", ") || "(none)"}\n`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => fail(err instanceof Error ? (err.stack ?? err.message) : String(err)))
}
