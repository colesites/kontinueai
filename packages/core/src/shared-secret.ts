export function sharedSecretMatches(
  expected: string | undefined,
  provided: string | null,
): boolean {
  if (!expected || !provided) return false;
  const expectedBytes = new TextEncoder().encode(expected);
  const providedBytes = new TextEncoder().encode(provided);
  let difference = expectedBytes.length ^ providedBytes.length;
  const length = Math.max(expectedBytes.length, providedBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (providedBytes[index] ?? 0);
  }
  return difference === 0;
}
