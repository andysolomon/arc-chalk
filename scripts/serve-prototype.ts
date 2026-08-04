import { extname, resolve, sep } from "node:path";

const prototypeRoot = resolve(
  import.meta.dirname,
  "../Chalk Football Play Editor-2",
);
const port = Number.parseInt(process.env.CHALK_PROTOTYPE_PORT ?? "4174", 10);

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const isInsidePrototype = (path: string): boolean =>
  path === prototypeRoot || path.startsWith(`${prototypeRoot}${sep}`);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const requestedPath =
      url.pathname === "/" ? "/Chalk Play Editor.dc.html" : url.pathname;

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(requestedPath);
    } catch {
      return new Response("Malformed path", { status: 400 });
    }

    const filePath = resolve(prototypeRoot, `.${decodedPath}`);
    if (!isInsidePrototype(filePath)) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          contentTypes[extname(filePath).toLowerCase()] ??
          "application/octet-stream",
      },
    });
  },
});

console.info(`Canonical Chalk prototype: ${server.url}`);
