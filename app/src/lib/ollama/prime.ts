/**
 * Pull the first item of an async iterable before committing to a response.
 *
 * Streaming routes use this so that failures happening before any output
 * (Ollama down, queue timeout, HTTP error, client already gone) become a
 * proper JSON error status instead of a 200 with an inline "[error]" line.
 * The returned iterator replays the first item, then continues the source.
 * Errors from the first pull are thrown to the caller.
 */
export async function primeStream<T>(source: AsyncIterable<T>): Promise<AsyncIterableIterator<T>> {
  const it = source[Symbol.asyncIterator]()
  const first = await it.next()
  let replayed = false
  const primed: AsyncIterableIterator<T> = {
    next: () => {
      if (!replayed) {
        replayed = true
        return Promise.resolve(first)
      }
      return it.next()
    },
    return: (value?: unknown) => {
      replayed = true
      return it.return
        ? it.return(value as T)
        : Promise.resolve({ done: true, value: value as T })
    },
    [Symbol.asyncIterator]() {
      return primed
    },
  }
  return primed
}
