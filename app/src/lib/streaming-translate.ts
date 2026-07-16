/**
 * Stream a bilingual translation from /api/translate, surfacing progressive
 * updates via `onProgress`. Returns the final accumulated text.
 *
 * The endpoint emits the bilingual rendering as `text/plain` chunks so the
 * caller can update its UI on every yielded fragment for a chat-like typing
 * effect. If the request fails, the rejected promise contains the failure.
 */
export async function streamTranslate(
  text: string,
  onProgress: (accumulated: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`translate http ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let acc = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    acc += decoder.decode(value, { stream: true })
    onProgress(acc)
  }
  // Server signals failure inline by appending "[error] ..." to the stream;
  // surface it as a thrown error so callers can show a consistent message.
  if (/\[error\][^\n]*$/.test(acc)) {
    throw new Error(acc)
  }
  return acc
}
