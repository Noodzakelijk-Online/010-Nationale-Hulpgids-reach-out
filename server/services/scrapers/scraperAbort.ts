export type ScraperRunOptions = {
  signal?: AbortSignal;
};

export function throwIfScraperAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Scraper run aborted", "AbortError");
  }
}

export async function runWithScraperAbort<T>(
  work: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  throwIfScraperAborted(signal);
  if (!signal) return work;

  let cleanup: (() => void) | undefined;
  return Promise.race([
    work.finally(() => cleanup?.()),
    new Promise<T>((_, reject) => {
      const abort = () =>
        reject(new DOMException("Scraper run aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      cleanup = () => signal.removeEventListener("abort", abort);
    }),
  ]);
}
