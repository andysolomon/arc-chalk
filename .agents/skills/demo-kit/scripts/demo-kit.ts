#!/usr/bin/env bun
/**
 * Builds a demo kit for one Chalk feature in <checkout>/.demo-kit/<slug>.
 *
 *   bun .agents/skills/demo-kit/scripts/demo-kit.ts <command> <slug>
 *
 *   new <slug>       write a starter kit.json and walkthrough.demo.ts
 *   record <slug>    film the walkthrough and caption the video
 *   build <slug>     check the copy and write index.html
 *   serve <slug>     publish the kit folder on the tailnet
 *   stop <slug>      take the published kit down
 *
 * record needs the instance that verify-chalk launches.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

import { checkCopy } from "../../../../scripts/copy-rules";
import type { Beat } from "./demo";

const skillDir = path.resolve(
  path.dirname(realpathSync(import.meta.filename)),
  "..",
);
const root = path.resolve(skillDir, "../../..");
const kitsDir = path.join(root, ".demo-kit");
const verify = path.join(
  root,
  ".agents/skills/verify-chalk/scripts/chalk-verify.ts",
);

/** The caption band under the film, in pixels. */
const BAND = 72;
/** A caption has to fit the band on one line at 1280 pixels wide. */
const CAPTION_LIMIT = 64;

interface Kit {
  readonly title: string;
  readonly summary: string;
  readonly where: string;
  readonly tryIt: readonly string[];
  readonly diagramCaption?: string;
}

interface Recording {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly beats: readonly Beat[];
  readonly commit: string;
  readonly dirty: boolean;
  readonly recordedAt: string;
  readonly offsetMs: number;
  readonly durationMs: number;
}

function die(message: string): never {
  console.error(`demo-kit: ${message}`);
  process.exit(1);
}

function git(...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function kitDir(slug: string | undefined): string {
  if (slug === undefined || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    die("name the kit with a slug of lower-case letters, digits and hyphens.");
  }
  return path.join(kitsDir, slug);
}

function readJson<T>(file: string): T {
  if (!existsSync(file)) die(`missing ${path.relative(root, file)}.`);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function create(slug: string | undefined): void {
  const dir = kitDir(slug);
  if (existsSync(dir)) die(`${path.relative(root, dir)} already exists.`);
  mkdirSync(dir, { recursive: true });
  const kit: Kit = {
    title: "Name the feature the way a Coach would",
    summary:
      "Say what a Coach can do now, in one or two sentences, in the words CONTEXT.md uses.",
    where: "Say where the feature is in the app.",
    tryIt: ["Write each step a Coach takes to try it."],
    diagramCaption: "Say what the diagram shows in one sentence.",
  };
  writeFileSync(
    path.join(dir, "kit.json"),
    `${JSON.stringify(kit, null, 2)}\n`,
  );
  copyFileSync(
    path.join(skillDir, "assets/walkthrough.demo.ts"),
    path.join(dir, "walkthrough.demo.ts"),
  );
  console.log(`Wrote ${path.relative(root, dir)}/kit.json`);
  console.log(`Wrote ${path.relative(root, dir)}/walkthrough.demo.ts`);
}

/** "Control+Shift+f" as a person writes it: "Ctrl + Shift + F". */
function keyLabel(combo: string): string {
  const names: Record<string, string> = {
    Control: "Ctrl",
    Escape: "Esc",
    Meta: "Cmd",
    " ": "Space",
  };
  return combo
    .split("+")
    .map((key) => names[key] ?? (key.length === 1 ? key.toUpperCase() : key))
    .join(" + ");
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** Films the walkthrough, then trims the film and captions it. */
function record(slug: string | undefined): void {
  const dir = kitDir(slug);
  const script = path.join(dir, "walkthrough.demo.ts");
  if (!existsSync(script)) die(`missing ${path.relative(root, script)}.`);
  const drive = spawnSync("bun", [verify, "drive", script], {
    cwd: root,
    encoding: "utf8",
  });
  process.stdout.write(drive.stdout ?? "");
  process.stderr.write(drive.stderr ?? "");
  if (drive.status !== 0)
    die("the walkthrough failed. Fix it and record again.");
  const runDir = /^Evidence: (.+)$/m.exec(drive.stdout ?? "")?.[1];
  if (runDir === undefined) die("the run did not say where its evidence is.");
  const artifacts = path.join(runDir, "artifacts");
  const folder = readdirSync(artifacts, { withFileTypes: true }).find(
    (entry) =>
      entry.isDirectory() &&
      existsSync(path.join(artifacts, entry.name, "beats.json")),
  );
  if (!folder)
    die("the walkthrough called no beat, so there is nothing to show.");
  const source = path.join(artifacts, folder.name);
  const filmed = readJson<Pick<Recording, "viewport" | "beats">>(
    path.join(source, "beats.json"),
  );
  const first = filmed.beats[0];
  const last = filmed.beats.at(-1);
  if (!first || !last) die("the walkthrough called no beat.");
  for (const beat of filmed.beats) {
    if (beat.caption.length > CAPTION_LIMIT) {
      die(
        `a caption is ${beat.caption.length} characters and the band holds ${CAPTION_LIMIT}: "${beat.caption}"`,
      );
    }
  }

  // Start a moment before the first caption and end a moment after the last.
  const offsetMs = Math.max(0, first.startMs - 300);
  const durationMs = last.endMs + 500 - offsetMs;
  for (const stale of readdirSync(dir)) {
    if (/^step-\d+\.png$/.test(stale)) rmSync(path.join(dir, stale));
  }
  for (const beat of filmed.beats) {
    copyFileSync(path.join(source, beat.still), path.join(dir, beat.still));
  }
  copyFileSync(path.join(source, "video.webm"), path.join(dir, "raw.webm"));

  const work = path.join(dir, ".work");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work);
  const { width, height } = filmed.viewport;
  const middle = `${height}+(${BAND}-text_h)/2`;
  const filters = [`pad=${width}:${height + BAND}:0:0:color=0x171717`];
  filmed.beats.forEach((beat, index) => {
    const from = seconds(beat.startMs - offsetMs);
    const to = seconds(
      (filmed.beats[index + 1]?.startMs ?? last.endMs + 500) - offsetMs,
    );
    writeFileSync(path.join(work, `caption-${index}.txt`), beat.caption);
    writeFileSync(
      path.join(work, `count-${index}.txt`),
      `${index + 1} of ${filmed.beats.length}`,
    );
    const shown = `enable='between(t,${from},${to})'`;
    filters.push(
      `drawtext=font=Sans:textfile=caption-${index}.txt:fontcolor=white:fontsize=25:x=(w-text_w)/2:y=${middle}:${shown}`,
      `drawtext=font=Mono:textfile=count-${index}.txt:fontcolor=0x8f8f8f:fontsize=16:x=28:y=${middle}:${shown}`,
    );
    beat.keys.forEach((key, keyIndex) => {
      const at = Math.max(0, key.atMs - offsetMs);
      writeFileSync(
        path.join(work, `key-${index}-${keyIndex}.txt`),
        keyLabel(key.combo),
      );
      filters.push(
        `drawtext=font=Mono:textfile=key-${index}-${keyIndex}.txt:fontcolor=0xd4d4d4:fontsize=16:x=w-text_w-28:y=${middle}:enable='between(t,${seconds(at)},${seconds(at + 1800)})'`,
      );
    });
  });
  const film = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      seconds(offsetMs),
      "-i",
      path.join(dir, "raw.webm"),
      "-t",
      seconds(durationMs),
      "-vf",
      filters.join(","),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "20",
      "-movflags",
      "+faststart",
      "-an",
      path.join(dir, "walkthrough.mp4"),
    ],
    { cwd: work, encoding: "utf8" },
  );
  if (film.status !== 0) die(`ffmpeg failed: ${film.stderr}`);
  rmSync(work, { recursive: true });
  rmSync(path.join(dir, "raw.webm"));
  // The poster is the film's own last frame, so it has the film's shape.
  const poster = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-sseof",
      "-0.3",
      "-i",
      path.join(dir, "walkthrough.mp4"),
      "-frames:v",
      "1",
      "-update",
      "1",
      path.join(dir, "poster.png"),
    ],
    { encoding: "utf8" },
  );
  if (poster.status !== 0) die(`ffmpeg failed: ${poster.stderr}`);

  const recording: Recording = {
    ...filmed,
    commit: git("rev-parse", "HEAD"),
    dirty: git("status", "--porcelain", "--", "apps", "packages") !== "",
    recordedAt: new Date().toISOString(),
    offsetMs,
    durationMs,
  };
  writeFileSync(
    path.join(dir, "recording.json"),
    `${JSON.stringify(recording, null, 2)}\n`,
  );
  console.log(
    `\nFilmed ${filmed.beats.length} steps, ${(durationMs / 1000).toFixed(1)}s: ${path.relative(root, dir)}/walkthrough.mp4`,
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Checks every sentence a person will read, then writes the page. */
function build(slug: string | undefined): void {
  const dir = kitDir(slug);
  const kit = readJson<Kit>(path.join(dir, "kit.json"));
  const recording = readJson<Recording>(path.join(dir, "recording.json"));

  const copy: [string, string][] = [
    ["title", kit.title],
    ["summary", kit.summary],
    ["where", kit.where],
    ...kit.tryIt.map((step, index): [string, string] => [
      `tryIt[${index}]`,
      step,
    ]),
    ...(kit.diagramCaption === undefined
      ? []
      : ([["diagramCaption", kit.diagramCaption]] as [string, string][])),
    ...recording.beats.flatMap((beat, index): [string, string][] => [
      [`step ${index + 1} caption`, beat.caption],
      ...(beat.detail === undefined
        ? []
        : ([[`step ${index + 1} detail`, beat.detail]] as [string, string][])),
    ]),
  ];
  let problems = 0;
  for (const [name, text] of copy) {
    for (const finding of checkCopy(text)) {
      problems += 1;
      console.error(
        `${name}: rule ${finding.rule}: ${finding.message} Found "${finding.found}".`,
      );
    }
  }
  if (problems > 0) {
    die(
      `${problems} to fix in the copy. The rules are in .agents/skills/unslop.`,
    );
  }

  const steps = recording.beats
    .map((beat, index) => {
      const at = Math.max(0, beat.startMs - recording.offsetMs);
      return `
      <li class="step">
        <a class="still" href="${beat.still}"><img src="${beat.still}" alt="The screen after step ${index + 1}: ${escapeHtml(beat.caption)}" loading="lazy"></a>
        <div class="words">
          <p class="count">Step ${index + 1} of ${recording.beats.length}</p>
          <h3>${escapeHtml(beat.caption)}</h3>
          ${beat.detail === undefined ? "" : `<p>${escapeHtml(beat.detail)}</p>`}
          <button type="button" data-seek="${(at / 1000).toFixed(2)}">Watch from ${clock(at)}</button>
        </div>
      </li>`;
    })
    .join("");

  const diagramFile = path.join(dir, "diagram.svg");
  const diagram = existsSync(diagramFile)
    ? `
    <section aria-labelledby="how">
      <h2 id="how">How it works</h2>
      ${kit.diagramCaption === undefined ? "" : `<p class="lede">${escapeHtml(kit.diagramCaption)}</p>`}
      <div class="diagram">${readFileSync(diagramFile, "utf8").replace(/^<\?xml[^>]*\?>\s*/u, "")}</div>
    </section>`
    : "";

  const tryIt = kit.tryIt
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join("\n        ");
  const { width, height } = recording.viewport;
  const fields: Record<string, string> = {
    title: escapeHtml(kit.title),
    summary: escapeHtml(kit.summary),
    where: escapeHtml(kit.where),
    steps,
    diagram,
    tryIt,
    ratio: `${width} / ${height + BAND}`,
    duration: clock(recording.durationMs),
    stepCount: String(recording.beats.length),
    commit: recording.commit.slice(0, 7),
    commitNote: recording.dirty ? " with uncommitted changes" : "",
    date: recording.recordedAt.slice(0, 10),
    frame: `${width}×${height}`,
    slug: path.basename(dir),
  };
  const page = readFileSync(
    path.join(skillDir, "assets/kit-template.html"),
    "utf8",
  ).replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = fields[name];
    if (value === undefined)
      die(`the template names an unknown field: ${name}`);
    return value;
  });
  writeFileSync(path.join(dir, "index.html"), page);
  console.log(`Wrote ${path.relative(root, dir)}/index.html`);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("No port."));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function tailscale(...args: string[]): { ok: boolean; out: string } {
  const result = spawnSync("tailscale", args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

interface Served {
  readonly pid: number;
  readonly port: number;
  readonly tailnetPort: number;
  readonly url: string;
}

async function serve(slug: string | undefined): Promise<void> {
  const dir = kitDir(slug);
  if (!existsSync(path.join(dir, "index.html"))) die("build the kit first.");
  const statePath = path.join(dir, ".served.json");
  if (existsSync(statePath)) {
    console.log(readJson<Served>(statePath).url);
    return;
  }
  const status = tailscale("status", "--json");
  if (!status.ok) die("tailscale is not available on this machine.");
  const host = (
    JSON.parse(status.out) as { Self: { DNSName: string } }
  ).Self.DNSName.replace(/\.$/, "");
  const port = await freePort();
  const child = spawn(
    "bun",
    [path.join(skillDir, "scripts/static-server.ts"), dir, String(port)],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  if (child.pid === undefined) die("the file server did not start.");
  const serving = tailscale("serve", "status", "--json").out;
  let tailnetPort = 8450;
  while (serving.includes(`:${tailnetPort}"`) && tailnetPort < 8500) {
    tailnetPort += 1;
  }
  const published = tailscale(
    "serve",
    "--bg",
    `--https=${tailnetPort}`,
    `http://127.0.0.1:${port}`,
  );
  if (!published.ok) {
    process.kill(-child.pid, "SIGTERM");
    die(`tailscale serve failed: ${published.out.trim()}`);
  }
  const served: Served = {
    pid: child.pid,
    port,
    tailnetPort,
    url: `https://${host}:${tailnetPort}`,
  };
  writeFileSync(statePath, `${JSON.stringify(served, null, 2)}\n`);
  console.log(served.url);
}

function stop(slug: string | undefined): void {
  const statePath = path.join(kitDir(slug), ".served.json");
  if (!existsSync(statePath)) {
    console.log("Nothing is published.");
    return;
  }
  const served = readJson<Served>(statePath);
  tailscale("serve", `--https=${served.tailnetPort}`, "off");
  try {
    process.kill(-served.pid, "SIGTERM");
  } catch {
    // The file server already exited.
  }
  rmSync(statePath);
  console.log(`Took down ${served.url}. The kit folder stays.`);
}

const [command, slug] = process.argv.slice(2);
switch (command) {
  case "new":
    create(slug);
    break;
  case "record":
    record(slug);
    break;
  case "build":
    build(slug);
    break;
  case "serve":
    await serve(slug);
    break;
  case "stop":
    stop(slug);
    break;
  default:
    die("use new, record, build, serve or stop, then the kit's slug.");
}
