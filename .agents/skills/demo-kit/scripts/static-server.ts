#!/usr/bin/env bun
/**
 * Serves one folder on 127.0.0.1 for `demo-kit serve`. It answers range
 * requests, which a browser needs to seek in the film.
 *
 *   bun static-server.ts <folder> <port>
 */
import path from "node:path";

const [folder, port] = process.argv.slice(2);
if (folder === undefined || port === undefined) {
  console.error("Usage: static-server.ts <folder> <port>");
  process.exit(2);
}
const base = path.resolve(folder);

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(port),
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = path.resolve(
      base,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    const hidden = path
      .relative(base, file)
      .split(path.sep)
      .some((part) => part.startsWith("."));
    if (!file.startsWith(`${base}${path.sep}`) || hidden) {
      return new Response("Not found", { status: 404 });
    }
    const body = Bun.file(file);
    if (!(await body.exists()))
      return new Response("Not found", { status: 404 });
    return new Response(body);
  },
});
