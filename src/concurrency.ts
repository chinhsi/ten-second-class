// A failed item must not prevent the rest of the class from being retried.
export async function retryConcurrent<T>(
  items: T[],
  task: (item: T) => Promise<unknown>,
  limit = 4,
) {
  let next = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          await task(item);
        } catch {
          failed++;
        }
      }
    }),
  );
  return failed;
}
