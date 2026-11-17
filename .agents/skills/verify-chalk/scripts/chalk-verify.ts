#!/usr/bin/env bun
/**
 * Runs this checkout's own Chalk dev server and drives it in Chromium.
 *
 *   bun .agents/skills/verify-chalk/scripts/chalk-verify.ts <command>
 *
 *   launch              start the server on a free port and wait for the editor
 *   doctor              read-only check that the instance is ours and answering
 *   look                open one page, print its ARIA tree, save a screenshot
 *   drive <spec...>     run specs or journeys against the instance, with evidence
 *   share               publish the instance on the tailnet
 *   stop                stop what launch started; evidence stays
 *
 * State and evidence live in <checkout>/.verify, which git ignores.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

import { chromium, devices, type Page } from "@playwright/test";

const skillDir = path.resolve(
  path.dirname(realpathSync(import.meta.filename)),
  "..",
);
const root = path.resolve(skillDir, "../../..");
const stateDir = path.join(root, ".verify");
const instancePath = path.join(stateDir, "instance.json");
const logPath = path.join(stateDir, "server.log");
const configPath = path.join(skillDir, "playwright.verify.config.ts");

interface Instance {
  readonly pid: number;
  readonly port: number;
  readonly url: string;
  readonly root: string;
  readonly sha: string;
  readonly dirtyAtLaunch: boolean;
  readonly startedAt: string;
  readonly cloud: boolean;
  readonly tailnet?: { readonly port: number; readonly url: string };
}

interface Check {
  readonly ok: boolean;
  readonly label: string;
  readonly detail: string;
}

function die(message: string): never {
  console.error(`chalk-verify: ${message}`);
  process.exit(1);
}

function git(...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function readInstance(): Instance | undefined {
  if (!existsSync(instancePath)) return undefined;
  return JSON.parse(readFileSync(instancePath, "utf8")) as Instance;
}

function writeInstance(instance: Instance): void {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(instancePath, `${JSON.stringify(instance, null, 2)}\n`);
}

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
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

async function fetchShell(
  url: string,
): Promise<{ status: number; body: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  return { status: response.status, body: await response.text() };
}

async function waitForShell(url: string, pid: number): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (!groupAlive(pid)) {
      die(`the server exited while starting. Read ${logPath}.`);
    }
    try {
      const shell = await fetchShell(url);
      if (shell.status === 200) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  die(`the server did not answer at ${url} within 45s. Read ${logPath}.`);
}

/** The pid listening on the port, or undefined where `ss` cannot say. */
function listenerPid(port: number): number | undefined {
  const result = spawnSync("ss", ["-ltnpH", `sport = :${port}`], {
    encoding: "utf8",
  });
  if (result.status !== 0) return undefined;
  const match = /pid=(\d+)/.exec(result.stdout);
  return match ? Number(match[1]) : undefined;
}

async function diagnose(instance: Instance): Promise<Check[]> {
  const checks: Check[] = [];
  checks.push({
    ok: instance.root === root,
    label: "checkout",
    detail:
      instance.root === root
        ? root
        : `recorded for ${instance.root}, not ${root}`,
  });
  const alive = groupAlive(instance.pid);
  checks.push({
    ok: alive,
    label: "process",
    detail: alive
      ? `process group ${instance.pid} is running`
      : `process group ${instance.pid} is gone`,
  });
  const owner = listenerPid(instance.port);
  if (owner === undefined) {
    checks.push({
      ok: alive,
      label: "port",
      detail: `could not read the listener on ${instance.port} with ss`,
    });
  } else {
    let cwd = "";
    try {
      cwd = readlinkSync(`/proc/${owner}/cwd`);
    } catch {
      // The listener belongs to another user, or /proc is absent.
    }
    const ours = cwd.startsWith(root);
    checks.push({
      ok: ours,
      label: "port",
      detail: ours
        ? `${instance.port} is held by pid ${owner} in this checkout`
        : `${instance.port} is held by pid ${owner} in ${cwd || "an unreadable directory"}`,
    });
  }
  try {
    const shell = await fetchShell(instance.url);
    const chalk = shell.body.includes("<title>Chalk</title>");
    checks.push({
      ok: shell.status === 200 && chalk,
      label: "shell",
      detail: `${instance.url} answered ${shell.status}${chalk ? " with the Chalk shell" : ", not the Chalk shell"}`,
    });
  } catch (error) {
    checks.push({
      ok: false,
      label: "shell",
      detail: `${instance.url} did not answer: ${String(error)}`,
    });
  }
  return checks;
}

function printChecks(checks: readonly Check[]): boolean {
  for (const check of checks) {
    console.log(
      `${check.ok ? "ok  " : "FAIL"} ${check.label.padEnd(9)}${check.detail}`,
    );
  }
  return checks.every((check) => check.ok);
}

async function requireHealthy(): Promise<Instance> {
  const instance = readInstance();
  if (!instance) die("no instance. Run launch first.");
  const checks = await diagnose(instance);
  if (!checks.every((check) => check.ok)) {
    printChecks(checks);
    die("the instance is not healthy. Run stop, then launch.");
  }
  return instance;
}

/** A clean device: no library, no settings, the season pinned off. */
async function openCleanEditor(
  page: Page,
  url: string,
  options: { seed: boolean; path: string },
): Promise<void> {
  await page.addInitScript((seed) => {
    if (window !== window.top) return;
    if (sessionStorage.getItem("chalk.verify.cleared") === "1") return;
    window.localStorage.clear();
    indexedDB.deleteDatabase("chalk-production-beta");
    sessionStorage.setItem("chalk.verify.cleared", "1");
    sessionStorage.setItem("chalk.season", "none");
    if (seed) sessionStorage.setItem("chalk.seedStarter", "1");
  }, options.seed);
  await page.goto(new URL(options.path, url).toString());
  await page
    .getByRole("img", { name: /football play$/ })
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
}

async function launch(flags: Set<string>): Promise<void> {
  const existing = readInstance();
  if (existing) {
    const checks = await diagnose(existing);
    if (checks.every((check) => check.ok)) {
      console.log(`Already running at ${existing.url}`);
      return;
    }
    printChecks(checks);
    die("an unhealthy instance is recorded. Run stop, then launch.");
  }
  mkdirSync(stateDir, { recursive: true });
  const cloud = flags.has("--cloud");
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const log = openSync(logPath, "w");
  const child = spawn(
    "bun",
    ["run", "dev", "--port", String(port), "--strictPort"],
    {
      cwd: path.join(root, "apps/web"),
      detached: true,
      stdio: ["ignore", log, log],
      // CI runs the specs signed out with no cloud. A local .env.local would
      // change that, so the keys are blanked unless --cloud asks for them.
      env: cloud
        ? process.env
        : {
            ...process.env,
            VITE_CONVEX_URL: "",
            VITE_CLERK_PUBLISHABLE_KEY: "",
          },
    },
  );
  closeSync(log);
  child.unref();
  if (child.pid === undefined) die("the server did not start.");
  writeInstance({
    pid: child.pid,
    port,
    url,
    root,
    sha: git("rev-parse", "HEAD"),
    dirtyAtLaunch: git("status", "--porcelain") !== "",
    startedAt: new Date().toISOString(),
    cloud,
  });
  await waitForShell(url, child.pid);
  // Answering is not usable: the first load compiles the app. Open the
  // editor once in Chromium and wait for the field.
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    const page = await browser.newPage();
    await openCleanEditor(page, url, { seed: false, path: "/" });
  } catch (error) {
    await browser.close();
    await stop();
    die(`the editor never drew its field: ${String(error)}`);
  }
  await browser.close();
  console.log(`Chalk is ready at ${url}`);
  console.log(`pid ${child.pid}, log ${path.relative(root, logPath)}`);
}

async function doctor(): Promise<void> {
  const instance = readInstance();
  if (!instance) die("no instance. Run launch first.");
  const healthy = printChecks(await diagnose(instance));
  const head = git("rev-parse", "HEAD");
  console.log(
    `     launched ${instance.startedAt} at ${instance.sha.slice(0, 7)}${instance.dirtyAtLaunch ? " with uncommitted changes" : ""}`,
  );
  console.log(
    `     HEAD is ${head.slice(0, 7)}. The dev server serves the working tree, so later edits are live.`,
  );
  if (instance.cloud)
    console.log("     cloud keys from the environment are on");
  if (instance.tailnet) console.log(`     tailnet ${instance.tailnet.url}`);
  if (!healthy) process.exit(1);
}

function flagValues(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  args.forEach((arg, index) => {
    const next = args[index + 1];
    if (arg === name && next !== undefined) values.push(next);
  });
  return values;
}

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
}

async function look(args: readonly string[]): Promise<void> {
  const instance = await requireHealthy();
  const phone = args.includes("--phone");
  const target = flagValues(args, "--path")[0] ?? "/";
  const name = flagValues(args, "--name")[0] ?? "look";
  const browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext(
    phone
      ? devices["Pixel 7"]
      : {
          ...devices["Desktop Chrome"],
          viewport: { width: 1440, height: 960 },
        },
  );
  const page = await context.newPage();
  try {
    await openCleanEditor(page, instance.url, {
      seed: args.includes("--seed"),
      path: target,
    });
    for (const action of flagValues(args, "--do")) {
      const space = action.indexOf(" ");
      const verb = space === -1 ? action : action.slice(0, space);
      const rest = space === -1 ? "" : action.slice(space + 1);
      if (verb === "press") await page.keyboard.press(rest);
      else if (verb === "click") await page.locator(rest).first().click();
      else die(`look does not know "${verb}". Use press or click.`);
    }
    const scope = flagValues(args, "--scope")[0] ?? "body";
    const directory = path.join(stateDir, "looks");
    mkdirSync(directory, { recursive: true });
    const shot = path.join(directory, `${timestamp()}-${name}.png`);
    await page.screenshot({ path: shot });
    const region = page.locator(scope).first();
    if ((await region.count()) === 0) {
      console.log(`Nothing matches --scope ${scope}. The whole page follows.`);
      console.log(await page.locator("body").ariaSnapshot());
    } else {
      console.log(await region.ariaSnapshot());
    }
    console.log(`\nScreenshot: ${shot}`);
  } finally {
    await browser.close();
  }
}

interface ReportSuite {
  readonly file?: string;
  readonly suites?: readonly ReportSuite[];
  readonly specs?: readonly {
    readonly title: string;
    readonly file: string;
    readonly tests: readonly {
      readonly projectName: string;
      readonly results: readonly {
        readonly status: string;
        readonly attachments: readonly {
          readonly name: string;
          readonly path?: string;
        }[];
      }[];
    }[];
  }[];
}

function writeEvidenceIndex(runDir: string, instance: Instance): string {
  const reportPath = path.join(runDir, "report.json");
  const lines = [
    `# Verification run ${path.basename(runDir)}`,
    "",
    `- Checkout: ${root}`,
    `- Commit: ${git("rev-parse", "HEAD")}${git("status", "--porcelain") === "" ? "" : " plus uncommitted changes"}`,
    `- Instance: ${instance.url}`,
    "",
  ];
  if (!existsSync(reportPath)) {
    lines.push("Playwright wrote no report. The run did not start.");
  } else {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      suites: readonly ReportSuite[];
    };
    const visit = (suite: ReportSuite): void => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) {
          const result = test.results.at(-1);
          lines.push(
            `## ${result?.status ?? "not run"}: ${spec.title}`,
            "",
            `${spec.file}, project ${test.projectName}`,
            "",
          );
          // Everything in the test's folder counts: what Playwright attached
          // and what the spec wrote with testInfo.outputPath.
          const artifacts = path.join(runDir, "artifacts");
          const folder = result?.attachments
            .map((attachment) => attachment.path)
            .filter((file): file is string => file !== undefined)
            .map((file) => path.relative(artifacts, file).split(path.sep)[0])
            .find((name) => name !== undefined && name !== "..");
          if (folder !== undefined) {
            const files = readdirSync(path.join(artifacts, folder), {
              recursive: true,
              withFileTypes: true,
            })
              .filter((entry) => entry.isFile())
              .map((entry) =>
                path.relative(runDir, path.join(entry.parentPath, entry.name)),
              )
              .sort();
            for (const file of files) lines.push(`- ${file}`);
          }
          lines.push("");
        }
      }
      for (const child of suite.suites ?? []) visit(child);
    };
    for (const suite of report.suites) visit(suite);
  }
  const indexPath = path.join(runDir, "evidence.md");
  writeFileSync(indexPath, `${lines.join("\n")}\n`);
  return indexPath;
}

async function drive(args: readonly string[]): Promise<void> {
  const instance = await requireHealthy();
  const split = args.indexOf("--");
  const own = split === -1 ? args : args.slice(0, split);
  const passthrough = split === -1 ? [] : args.slice(split + 1);
  const projects = flagValues(own, "--project");
  const specs = own.filter(
    (arg, index) => !arg.startsWith("--") && own[index - 1] !== "--project",
  );
  if (specs.length === 0) die("name at least one spec or journey to drive.");
  for (const spec of specs) {
    if (!existsSync(path.resolve(root, spec))) die(`no such file: ${spec}`);
  }
  if (projects.length === 0) {
    const names = specs.map((spec) => path.basename(spec));
    if (names.every((name) => name.endsWith(".demo.ts"))) {
      projects.push("demo");
    } else if (names.every((name) => name.startsWith("phone-"))) {
      projects.push("phone-chromium");
    } else {
      projects.push("chromium");
    }
  }
  const runDir = path.join(
    stateDir,
    "runs",
    `${timestamp()}-${git("rev-parse", "--short", "HEAD") || "nogit"}`,
  );
  mkdirSync(runDir, { recursive: true });
  const playwrightArgs = [
    "playwright",
    "test",
    "--config",
    configPath,
    ...specs.map((spec) => path.resolve(root, spec)),
    ...(projects.includes("all")
      ? []
      : projects.map((project) => `--project=${project}`)),
    ...(own.includes("--headed") ? ["--headed"] : []),
    ...passthrough,
  ];
  const result = spawnSync("bunx", playwrightArgs, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CHALK_VERIFY_URL: instance.url,
      CHALK_VERIFY_RUN_DIR: runDir,
    },
  });
  const indexPath = writeEvidenceIndex(runDir, instance);
  console.log(`\n${readFileSync(indexPath, "utf8")}`);
  console.log(`Evidence: ${runDir}`);
  process.exit(result.status ?? 1);
}

function tailscale(...args: string[]): { ok: boolean; out: string } {
  const result = spawnSync("tailscale", args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

async function share(): Promise<void> {
  const instance = await requireHealthy();
  if (instance.tailnet) {
    console.log(instance.tailnet.url);
    return;
  }
  const status = tailscale("status", "--json");
  if (!status.ok) die("tailscale is not available on this machine.");
  const host = (
    JSON.parse(status.out) as { Self: { DNSName: string } }
  ).Self.DNSName.replace(/\.$/, "");
  const serving = tailscale("serve", "status", "--json").out;
  let port = 8450;
  while (serving.includes(`:${port}"`) && port < 8500) port += 1;
  const served = tailscale("serve", "--bg", `--https=${port}`, instance.url);
  if (!served.ok) die(`tailscale serve failed: ${served.out.trim()}`);
  const tailnet = { port, url: `https://${host}:${port}` };
  writeInstance({ ...instance, tailnet });
  console.log(tailnet.url);
}

async function stop(): Promise<void> {
  const instance = readInstance();
  if (!instance) {
    console.log("Nothing to stop.");
    return;
  }
  if (instance.tailnet) {
    tailscale("serve", `--https=${instance.tailnet.port}`, "off");
  }
  if (groupAlive(instance.pid)) {
    process.kill(-instance.pid, "SIGTERM");
    const deadline = Date.now() + 5_000;
    while (groupAlive(instance.pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (groupAlive(instance.pid)) process.kill(-instance.pid, "SIGKILL");
  }
  rmSync(instancePath);
  console.log(
    `Stopped ${instance.url}. Evidence stays in ${path.relative(root, stateDir)}/runs.`,
  );
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "launch":
    await launch(new Set(rest));
    break;
  case "doctor":
    await doctor();
    break;
  case "look":
    await look(rest);
    break;
  case "drive":
    await drive(rest);
    break;
  case "share":
    await share();
    break;
  case "stop":
    await stop();
    break;
  default:
    die("use launch, doctor, look, drive, share or stop.");
}
