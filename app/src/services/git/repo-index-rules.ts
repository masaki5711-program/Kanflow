/**
 * Which repository files the knowledge index reads (pure, no I/O).
 *
 * Allowlist by extension (documents + common source code), then hard
 * exclusions: dependency / build folders, lockfiles, minified bundles and
 * anything that looks like a secret (.env*, keys, certificates, credential
 * files). Secrets are excluded by NAME here; repo-redact.ts additionally
 * masks secret-looking values inside the files that are indexed.
 */

export type FileKind = "text" | "office"

export type IndexDecision = { index: true; kind: FileKind; maxBytes: number } | { index: false; reason: "filter" | "excluded" | "secret" | "type" | "path" }

/** Per-file download caps. */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024
export const MAX_OFFICE_BYTES = 20 * 1024 * 1024
/** repo_chunk.path is VARCHAR(512). */
export const MAX_PATH_LENGTH = 512
/** Folder prefixes in one filter. */
export const MAX_FILTER_PREFIXES = 20

const DOC_EXTENSIONS = ["md", "markdown", "mdx", "txt", "rst", "adoc", "asciidoc", "csv", "tsv", "json", "yaml", "yml", "toml", "xml", "html", "htm", "sql", "ini", "cfg", "conf", "properties", "puml", "plantuml", "mmd", "drawio"]
const CODE_EXTENSIONS = [
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "py", "rs", "go", "java", "kt", "kts", "scala", "cs", "fs", "vb", "c", "cc", "cpp", "cxx",
  "h", "hh", "hpp", "m", "swift", "rb", "php", "pl", "lua", "r", "dart", "sh", "bash", "zsh", "ps1", "psm1", "bat", "cmd", "proto", "graphql", "gql",
  "tf", "hcl", "gradle", "cmake", "css", "scss", "less",
]
const OFFICE_EXTENSIONS = ["docx", "xlsx", "pptx", "pdf"]
/** Extension-less files worth reading. */
const TEXT_BASENAMES = ["readme", "license", "changelog", "dockerfile", "makefile", "jenkinsfile", "codeowners"]

const TEXT_SET = new Set([...DOC_EXTENSIONS, ...CODE_EXTENSIONS])
const OFFICE_SET = new Set(OFFICE_EXTENSIONS)

const EXCLUDED_DIRS = new Set([
  "node_modules", "vendor", "dist", "build", "out", "target", "bin", "obj", ".git", ".next", ".nuxt", "coverage", "__pycache__",
  ".venv", "venv", ".tox", ".gradle", ".idea", ".vscode", ".terraform", "bower_components", ".cache",
])
const LOCKFILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json", "cargo.lock", "poetry.lock", "pipfile.lock", "composer.lock",
  "go.sum", "gemfile.lock", "packages.lock.json", "bun.lockb", "uv.lock",
])

/** File names that hold secrets or are private key / certificate material. */
const SECRET_NAME_PATTERNS: readonly RegExp[] = [
  /^\.env(\..*)?$/,
  /\.env$/,
  /\.(pem|key|pfx|p12|jks|keystore|kdbx|ppk|asc|gpg|crt|cer|der|p8|tfstate|tfvars)$/,
  /^id_(rsa|dsa|ecdsa|ed25519)(\..*)?$/,
  /^\.(npmrc|pypirc|netrc|pgpass|htpasswd|git-credentials|dockercfg)$/,
  // Credential / secret CONFIG files (a design document like secret-management.md stays readable).
  /(credential|secret|password|passwd)[^/]*\.(json|ya?ml|toml|env|properties|ini|conf|cfg|config|txt|xml)$/,
  /^(credentials?|secrets?)$/,
  /^kubeconfig/,
  /^\.?aws_config$/,
  /token\.(json|txt|ya?ml)$/,
]

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

/** True for file names that look like secrets (exported for tests and the settings help). */
export function isSecretFileName(baseName: string): boolean {
  const name = baseName.toLowerCase()
  return SECRET_NAME_PATTERNS.some((re) => re.test(name))
}

/**
 * "docs, specs/api\n" → ["docs/", "specs/api/"]. Leading "./" or "/" is
 * dropped; ".." and odd characters make the whole filter invalid (null).
 */
export function parsePathFilter(raw: string | null | undefined): string[] | null {
  const parts = (raw ?? "")
    .split(/[,\n\r]+/)
    .map((p) => p.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "").replace(/\/+$/, ""))
    .filter(Boolean)
  if (parts.length > MAX_FILTER_PREFIXES) return null
  if (parts.some((p) => p.split("/").some((seg) => seg === ".." || seg === "." || !/^[\p{L}\p{N}_. -]+$/u.test(seg)))) return null
  return [...new Set(parts.map((p) => `${p}/`))]
}

/** Normalised form stored in the database ("docs/, specs/"), or null for "whole repository". */
export function normalizePathFilter(raw: string | null | undefined): string | null {
  const prefixes = parsePathFilter(raw)
  return prefixes && prefixes.length > 0 ? prefixes.join(", ") : null
}

/** Whether (and how) a repository file is indexed. */
export function decideFile(filePath: string, prefixes: readonly string[] = []): IndexDecision {
  if (!filePath || filePath.length > MAX_PATH_LENGTH) return { index: false, reason: "path" }
  if (prefixes.length > 0 && !prefixes.some((p) => filePath.startsWith(p))) return { index: false, reason: "filter" }
  const segments = filePath.split("/")
  const baseName = segments[segments.length - 1]
  if (segments.slice(0, -1).some((dir) => EXCLUDED_DIRS.has(dir.toLowerCase()))) return { index: false, reason: "excluded" }
  if (isSecretFileName(baseName)) return { index: false, reason: "secret" }
  const lower = baseName.toLowerCase()
  if (LOCKFILES.has(lower) || /\.min\.(js|css)$/.test(lower) || lower.endsWith(".map")) return { index: false, reason: "excluded" }
  const ext = extensionOf(lower)
  if (OFFICE_SET.has(ext)) return { index: true, kind: "office", maxBytes: MAX_OFFICE_BYTES }
  if (TEXT_SET.has(ext) || (!ext && TEXT_BASENAMES.includes(lower))) return { index: true, kind: "text", maxBytes: MAX_TEXT_BYTES }
  return { index: false, reason: "type" }
}
