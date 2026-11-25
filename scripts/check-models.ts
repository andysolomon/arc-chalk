import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Model-checks every TLA+ model under models/ and holds each config to what
 * its first line says TLC must report:
 *
 *   \* expect: pass
 *   \* expect: NoEditLost violated
 *
 * A config that expects a violation fails the run unless TLC reports that
 * property and no other. A check that can no longer fail is caught the day
 * it stops failing.
 *
 *   bun run check:models                      every config
 *   bun run check:models BugSnapshotCommand   one config, by name
 *
 * TLC runs from the jar pinned below. Set TLA_TOOLS_JAR to a copy already on
 * disk, or the jar is downloaded once into node_modules/.cache. Java 11 or
 * later comes from JAVA, then JAVA_HOME, then the PATH.
 */
const TLA_TOOLS = {
  version: "1.8.0",
  url: "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar",
  sha256: "fdffef247f563ef6edbfd44958d2a82db79e7564e07cb673262d896353fa6713",
} as const;

const root = fileURLToPath(new URL("../", import.meta.url));
const modelsDir = join(root, "models");
const workDir = join(root, ".tlc");

type Expectation =
  | { readonly kind: "pass" }
  | { readonly kind: "violated"; readonly property: string };

interface ModelRun {
  readonly name: string;
  readonly dir: string;
  readonly spec: string;
  readonly config: string;
  readonly expect: Expectation;
  /** The invariants and temporal properties the config names. */
  readonly checks: readonly string[];
}

interface TlcResult {
  readonly output: string;
  readonly passed: boolean;
  readonly violated: readonly string[];
  readonly states?: string;
  readonly seconds: number;
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function readExpectation(config: string, text: string): Expectation {
  const line = /^\\\* expect: (.+)$/m.exec(text)?.[1]?.trim();
  if (line === "pass") return { kind: "pass" };
  const violated = line && /^(\w+) violated$/.exec(line)?.[1];
  if (violated) return { kind: "violated", property: violated };
  return fail(
    `${config} must say what TLC must report, in a line such as "\\* expect: pass" or "\\* expect: NoEditLost violated".`,
  );
}

function readChecks(text: string): string[] {
  const words = text.replace(/\\\*.*$/gm, "").split(/\s+/);
  const checks: string[] = [];
  let listing = false;
  for (const word of words) {
    if (/^[A-Z_]+$/.test(word)) {
      listing = /^(INVARIANTS?|PROPERTY|PROPERTIES)$/.test(word);
    } else if (listing && word) {
      checks.push(word);
    }
  }
  return checks;
}

async function findRuns(only: ReadonlySet<string>): Promise<ModelRun[]> {
  const runs: ModelRun[] = [];
  const entries = await readdir(modelsDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(modelsDir, entry.name);
    const files = (await readdir(dir)).sort();
    const specs = files.filter((file) => file.endsWith(".tla"));
    if (specs.length !== 1) {
      fail(`${relative(root, dir)} must hold exactly one .tla spec.`);
    }
    for (const config of files.filter((file) => file.endsWith(".cfg"))) {
      const name = config.replace(/\.cfg$/, "");
      if (only.size > 0 && !only.has(name)) continue;
      const text = await readFile(join(dir, config), "utf8");
      const label = relative(root, join(dir, config));
      const expect = readExpectation(label, text);
      const checks = readChecks(text);
      if (expect.kind === "violated" && !checks.includes(expect.property)) {
        fail(
          `${label} expects ${expect.property} violated but never checks it.`,
        );
      }
      runs.push({ name, dir, spec: specs[0]!, config, expect, checks });
    }
  }
  return runs;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function tlaTools(): Promise<string> {
  const given = process.env.TLA_TOOLS_JAR;
  const jar =
    given ??
    join(root, `node_modules/.cache/tla2tools-${TLA_TOOLS.version}.jar`);
  let digest = await sha256(jar).catch(() => undefined);
  if (digest === undefined && given === undefined) {
    console.log(`Downloading TLA+ tools ${TLA_TOOLS.version}.`);
    const response = await fetch(TLA_TOOLS.url);
    if (!response.ok) {
      fail(`Could not download ${TLA_TOOLS.url}: ${response.status}.`);
    }
    await mkdir(join(jar, ".."), { recursive: true });
    await writeFile(`${jar}.part`, Buffer.from(await response.arrayBuffer()));
    await rename(`${jar}.part`, jar);
    digest = await sha256(jar);
  }
  if (digest === undefined)
    fail(`TLA_TOOLS_JAR names ${jar}, which is not there.`);
  if (digest !== TLA_TOOLS.sha256) {
    fail(
      `${jar} is not TLA+ tools ${TLA_TOOLS.version}: its sha256 is ${digest}, not ${TLA_TOOLS.sha256}.`,
    );
  }
  return jar;
}

function java(): string {
  if (process.env.JAVA) return process.env.JAVA;
  if (process.env.JAVA_HOME) return join(process.env.JAVA_HOME, "bin", "java");
  return "java";
}

function runTlc(jar: string, run: ModelRun): Promise<TlcResult> {
  const started = Date.now();
  const metaDir = join(workDir, run.name);
  const args = [
    "-XX:+UseParallelGC",
    `-Djava.io.tmpdir=${join(workDir, "tmp")}`,
    "-cp",
    jar,
    "tlc2.TLC",
    "-workers",
    "1",
    "-noGenerateSpecTE",
    "-metadir",
    metaDir,
    // A config that checks several properties and expects one broken must
    // show that the others hold, so TLC goes on past the first violation.
    ...(run.expect.kind === "violated" && run.checks.length > 1
      ? ["-continue"]
      : []),
    "-config",
    run.config,
    run.spec,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(java(), args, { cwd: run.dir });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "ENOENT"
          ? new Error(
              `Java was not found at "${java()}". Install Java 11 or later, or set JAVA or JAVA_HOME.`,
            )
          : error,
      ),
    );
    child.on("close", () => {
      const violated = new Set<string>();
      for (const match of output.matchAll(
        /^Error: (?:Invariant (\w+) is violated|Temporal property (\w+) was violated)/gm,
      )) {
        violated.add(match[1] ?? match[2]!);
      }
      if (/^Error: Deadlock reached/m.test(output)) violated.add("deadlock");
      void rm(metaDir, { recursive: true, force: true });
      resolve({
        output,
        passed: output.includes(
          "Model checking completed. No error has been found.",
        ),
        violated: [...violated].sort(),
        states:
          /^(\d[\d,]*) states generated, (\d[\d,]*) distinct states found/m.exec(
            output,
          )?.[2],
        seconds: Math.round((Date.now() - started) / 100) / 10,
      });
    });
  });
}

/** The first counterexample, as the steps TLC took. */
function firstTrace(output: string): string {
  const start = output.search(
    /^Error: The (?:behavior up to this point is|following behavior constitutes a counter-example):/m,
  );
  if (start < 0) return "";
  const steps: string[] = [];
  for (const line of output.slice(start).split("\n").slice(1)) {
    if (line.startsWith("Error:")) break;
    const step = /^State \d+: <(.+?)(?: line \d+.*)?>$/.exec(line)?.[1];
    if (step && step !== "Initial predicate") steps.push(step);
    const back = /^Back to state (\d+)/.exec(line)?.[1];
    if (back) steps.push(`back to state ${back}`);
  }
  return steps.join(" -> ");
}

function verdict(run: ModelRun, result: TlcResult): string | undefined {
  const named = result.violated.join(", ");
  if (run.expect.kind === "pass") {
    if (result.passed && result.violated.length === 0) return undefined;
    return result.violated.length > 0
      ? `expected to pass, but TLC reports ${named} violated`
      : "expected to pass, but TLC did not finish";
  }
  const { property } = run.expect;
  if (result.violated.length === 1 && result.violated[0] === property) {
    return undefined;
  }
  if (result.violated.length === 0) {
    return result.passed
      ? `expected ${property} violated, but TLC found no error: this check can no longer fail`
      : `expected ${property} violated, but TLC did not finish`;
  }
  return `expected only ${property} violated, but TLC reports ${named}`;
}

const only = new Set(process.argv.slice(2));
const runs = await findRuns(only);
if (runs.length === 0) fail("No model config matches.");
const jar = await tlaTools();
await mkdir(join(workDir, "tmp"), { recursive: true });

const results = new Map<ModelRun, TlcResult>();
const pending = [...runs];
await Promise.all(
  Array.from(
    { length: Math.min(runs.length, availableParallelism()) },
    async () => {
      for (let run = pending.shift(); run; run = pending.shift()) {
        results.set(run, await runTlc(jar, run));
      }
    },
  ),
);

let failures = 0;
for (const run of runs) {
  const result = results.get(run)!;
  const problem = verdict(run, result);
  const wanted =
    run.expect.kind === "pass" ? "pass" : `${run.expect.property} violated`;
  const label = `${relative(root, join(run.dir, run.config))}`;
  const summary = `${result.states ?? "?"} states, ${result.seconds}s`;
  if (problem === undefined) {
    console.log(`ok    ${label}: ${wanted} (${summary})`);
    const trace = firstTrace(result.output);
    if (trace) console.log(`      ${trace}`);
    continue;
  }
  failures += 1;
  const log = join(workDir, `${run.name}.out`);
  await writeFile(log, result.output);
  console.log(`FAIL  ${label}: ${problem} (${summary})`);
  const trace = firstTrace(result.output);
  if (trace) console.log(`      ${trace}`);
  console.log(`      TLC's output: ${relative(root, log)}`);
}

if (failures === 0) await rm(workDir, { recursive: true, force: true });
else await rm(join(workDir, "tmp"), { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
