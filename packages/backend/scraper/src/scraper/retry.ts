export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[withRetry] Attempt ${i}/${attempts} failed: ${lastError.message}`);

      if (i < attempts) {
        const delay = Math.pow(2, i - 1) * 1000;
        console.log(`[withRetry] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed after ${attempts} attempts. Last error: ${lastError?.message ?? "unknown"}`
  );
}
