/*
  Regression tests for the two findings that make the app quietly lie (#1, #2).

  #1  Coverage zones existed only on the canvas. Every paper and pixel output runs
      through exportSvgBody, so a defense printed without its zone areas.
  #2  A localStorage write that failed was swallowed while the button flashed "Saved".

  Run — serve the repo root in one shell, then run the tests in another:

    python3 -m http.server 8731
    node tests/export-and-persistence.mjs

  See tests/document-transitions.mjs for the PLAYWRIGHT_PATH note.
*/
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const chromium = pw.chromium || (pw.default && pw.default.chromium);

const URL = process.env.CHALK_URL || 'http://localhost:8731/Chalk%20Play%20Editor.dc.html';
const errors = [];
let pass = 0, fail = 0;
const check = (n, ok, note) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? '  — ' + note : ''}`); };
const ready = async (p) => { await p.waitForSelector('svg', { timeout: 20000 }); await p.waitForTimeout(1200); };
const openPlay = async (p, q) => {
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(250);
  await p.keyboard.type('Open: ' + q); await p.waitForTimeout(400);
  await p.keyboard.press('Enter'); await p.waitForTimeout(900);
};
// Save is driven through the command palette on purpose: the toolbar button's label
// changes when a save fails, so name-based lookup stops working exactly when it matters.
const saveNow = async (p) => {
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(300);
  await p.keyboard.type('Save play'); await p.waitForTimeout(400);
  await p.keyboard.press('Enter'); await p.waitForTimeout(1100);
};

const browser = await chromium.launch();

// ------------------------------------------------------------------ #1
console.log('\n#1 — coverage zones reach the export path');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' }); await ready(p);

  // The seeded Cover 3 ships with bubble markers but no zone sizes, so nothing draws an
  // ellipse. Give its zones real dimensions — the state a coach reaches by dragging the
  // handles — so both renderers have something to disagree about.
  const zones = await p.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem('fpd.plays.v1'));
    const d = lib.find(x => /Cover 3/.test(x.name));
    let k = 0;
    d.doc.routes.forEach(r => { if (r.kind === 'zone' && r.endMarker === 'bubble') { r.zone = { rx: 62, ry: 34, t: 'hook' }; k++; } });
    localStorage.setItem('fpd.plays.v1', JSON.stringify(lib));
    return k;
  });
  await p.reload({ waitUntil: 'networkidle' }); await ready(p);
  await openPlay(p, 'Cover 3');

  const onCanvas = await p.locator('svg ellipse').count();
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 15000 }),
    (async () => {
      await p.keyboard.press('Meta+k'); await p.waitForTimeout(250);
      await p.keyboard.type('Download SVG'); await p.waitForTimeout(400); await p.keyboard.press('Enter');
    })(),
  ]);
  const fs = await import('node:fs/promises');
  const svg = await fs.readFile(await dl.path(), 'utf8');
  const ell = (svg.match(/<ellipse/g) || []).length;
  const dashed = (svg.match(/stroke-dasharray="5 4"/g) || []).length;

  check('export contains zone ellipses', ell > 0, `${ell} for ${zones} zones`);
  check('one fill and one dashed outline per zone', dashed === zones && ell === zones * 2, `${dashed} dashed of ${ell}`);
  check('export matches the canvas exactly', ell === onCanvas, `canvas ${onCanvas} / export ${ell}`);
  check('bubble marker suppressed where a zone is drawn', !/marker-end="url\(#mk-bubble/.test(svg));
  await ctx.close();
}

// ------------------------------------------------------------------ #2
console.log('\n#2 — a failed save is never reported as saved');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' }); await ready(p);

  const lib = await p.evaluate(() => JSON.parse(localStorage.getItem('fpd.plays.v1')));
  await openPlay(p, lib[0].name.slice(0, 12));
  const c = await p.locator('svg circle').all();
  await c[Math.floor(c.length / 2)].click({ force: true });
  await p.waitForTimeout(150); await p.keyboard.press('Meta+d'); await p.waitForTimeout(400);

  // Fault injection rather than filling the quota: persist() deliberately frees space by
  // trimming history and retrying, so a merely-full store often succeeds on the second go.
  // This forces the terminal case the UI has to be honest about.
  await p.evaluate(() => {
    const orig = Storage.prototype.setItem;
    window.__unblock = () => { Storage.prototype.setItem = orig; };
    Storage.prototype.setItem = function (k, v) {
      if (String(k).startsWith('fpd.')) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      return orig.call(this, k, v);
    };
  });

  const before = await p.evaluate(() => localStorage.getItem('fpd.plays.v1'));
  await saveNow(p);
  const body = await p.locator('body').innerText();
  check('never claims "Saved"', !/\bSaved\b/.test(body));
  check('says "Not saved"', /Not saved/i.test(body));
  check('explains the cause', /storage/i.test(body));
  check('document stays marked unsaved', /not saved|unsaved/i.test(body));
  check('stored library untouched', (await p.evaluate(() => localStorage.getItem('fpd.plays.v1'))) === before);

  await p.evaluate(() => window.__unblock());
  await saveNow(p);
  check('status bar no longer reports storage full', !/storage full/i.test(await p.locator('body').innerText()));
  check('the play is actually stored', (await p.evaluate(() => localStorage.getItem('fpd.plays.v1'))) !== before);
  await p.waitForTimeout(4500);  // let the failure toast expire
  check('no stale failure state left behind', !/Not saved/i.test(await p.locator('body').innerText()));
  await ctx.close();
}

console.log(`\n${pass}/${pass + fail} passed · ${errors.length} page errors`);
errors.slice(0, 6).forEach(e => console.log('  ' + e));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
