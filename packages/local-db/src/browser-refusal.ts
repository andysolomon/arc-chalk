/**
 * How a browser refuses a storage API in a private window, with blocked site
 * data, on an opaque origin or on a full disk.
 */
function isBrowserRefusal(error: unknown): boolean {
  return error instanceof DOMException || error instanceof TypeError;
}

export function unlessBrowserRefuses<T>(use: () => T, refused: T): T {
  try {
    return use();
  } catch (error) {
    if (isBrowserRefusal(error)) return refused;
    throw error;
  }
}

export async function unlessBrowserRefusesAsync<T>(
  use: () => Promise<T>,
  refused: T,
): Promise<T> {
  try {
    return await use();
  } catch (error) {
    if (isBrowserRefusal(error)) return refused;
    throw error;
  }
}
