import { ConflictError, ValidationError } from "@/services/_shared/errors"

/**
 * Where a project's development data comes from (git_integration.provider).
 *
 * A project reads exactly ONE source: when its repositories move to GitStation
 * (M3), GitLab stays only as a mirror and is not read, or every merge request
 * and commit would appear twice. The one-row-per-project key of git_integration
 * (projectId) makes a second integration impossible; `assertOneSource` keeps a
 * project with repositories from switching its source underneath them.
 *
 * Only "gitlab" is accepted today; "gitstation" joins with its DevSource (M3).
 */
export const GIT_PROVIDERS = ["gitlab"] as const
export type GitProvider = (typeof GIT_PROVIDERS)[number]
export const DEFAULT_GIT_PROVIDER: GitProvider = "gitlab"

export function isGitProvider(value: unknown): value is GitProvider {
  return typeof value === "string" && (GIT_PROVIDERS as readonly string[]).includes(value)
}

/** An integration names a provider Kanflow cannot read (settings input or a stored row). */
export class UnsupportedProviderError extends ValidationError {
  readonly provider: string
  constructor(provider: unknown) {
    const shown = String(provider).slice(0, 32)
    super(`取り込み元「${shown}」には対応していません（対応: ${GIT_PROVIDERS.join(", ")}）。`, { provider: shown }, "GIT_PROVIDER_UNSUPPORTED")
    this.provider = shown
  }
}

/** The provider, or UnsupportedProviderError (never a silent fallback to GitLab). */
export function parseGitProvider(value: unknown): GitProvider {
  if (isGitProvider(value)) return value
  throw new UnsupportedProviderError(value)
}

/**
 * One ingestion source per project: a project that already has repositories
 * keeps its provider (remove the repositories first, or migrate them — M3).
 * `current` null = no integration row yet (nothing is read so far).
 */
export function assertOneSource(current: string | null, requested: GitProvider, repositoryCount: number): void {
  if (current === null || current === requested || repositoryCount === 0) return
  throw new ConflictError(
    `このプロジェクトは「${current}」からリポジトリを読み込んでいます。取り込み元はプロジェクトごとに 1 つです。切り替えるには先にリポジトリを外してください。`,
    { provider: current },
    "GIT_SOURCE_LOCKED",
  )
}
