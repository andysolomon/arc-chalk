import { EXPORT_PIXELS } from "@chalk/exports";

/** Hands the browser a file to save, then lets the URL go. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(name: string, text: string, type: string): void {
  downloadBlob(name, new Blob([text], { type }));
}

/**
 * Rasterizes a standalone SVG at the original's 2000×1240 on a white ground.
 * The dimensions are fixed rather than read from the screen so two machines
 * exporting the same revision get the same file.
 */
export function pngFromSvg(
  svgMarkup: string,
  size: { readonly width: number; readonly height: number } = EXPORT_PIXELS,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(
      new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }),
    );
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not draw the frame."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not encode the frame."));
          return;
        }
        resolve(blob);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the frame."));
    };
    image.src = url;
  });
}
