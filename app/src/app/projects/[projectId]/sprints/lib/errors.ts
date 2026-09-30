/** User-facing message of a failed request (ApiError carries the server's text). */
export function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}
