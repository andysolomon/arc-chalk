import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const port = Number.parseInt(process.env.CHALK_PROTOTYPE_PORT ?? "4174", 10);

const prototypeFiles = new Map<string, string>([
  ["/", resolve(repositoryRoot, "Chalk Play Editor.dc.html")],
  [
    "/Chalk Play Editor.dc.html",
    resolve(repositoryRoot, "Chalk Play Editor.dc.html"),
  ],
  ["/support.js", resolve(repositoryRoot, "support.js")],
]);

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const send = (response: ServerResponse, status: number, body: string): void => {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
};

const servePrototype = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    send(response, 400, "Malformed path");
    return;
  }

  const filePath = prototypeFiles.get(decodedPath);
  if (!filePath) {
    send(response, 404, "Not found");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type":
        contentTypes[extname(filePath).toLowerCase()] ??
        "application/octet-stream",
    });
    response.end(body);
  } catch {
    send(response, 404, "Not found");
  }
};

const server = createServer((request, response) => {
  void servePrototype(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.info(`Canonical Chalk prototype: http://127.0.0.1:${port}`);
});

const close = (): void => {
  server.close(() => process.exit(0));
};

process.once("SIGINT", close);
process.once("SIGTERM", close);
