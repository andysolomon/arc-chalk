/**
 * The original's `printDoc` tail: a blank window, the document written into
 * it, and the print dialog raised once the fonts have had a moment. A
 * blocked popup or a refused dialog is a no-op, as the original's is.
 */
export function openPrintWindow(
  html: string,
  open: typeof globalThis.open = (...args) => globalThis.open(...args),
): boolean {
  const popup = open("", "_blank");
  if (!popup) return false;
  popup.document.write(html);
  popup.document.close();
  globalThis.setTimeout(() => {
    try {
      popup.focus();
      popup.print();
    } catch {
      // A blocked print dialog is a no-op, as the original's is.
    }
  }, 400);
  return true;
}
