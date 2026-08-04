/*
  Regression tests for the two destructive document-transition paths (B1, B2).

  These cover the failure modes that lose a coach's work outright, so they are worth
  running before anything that touches savePlay, loadPlay, demoLoadPlay or newPlay.

  Run — serve the repo root in one shell, then run the tests in another:

    python3 -m http.server 8731
    node tests/document-transitions.mjs

  Playwright is imported by name, so this works anywhere it is installed locally.
  If you only have it globally (bun/npm -g), point PLAYWRIGHT_PATH at the package:

    PLAYWRIGHT_PATH=~/.bun/install/global/node_modules/playwright/index.js \
      node tests/document-transitions.mjs

  The app itself still has no build step, no package.json and no node_modules, and
  nothing here changes that.
*/
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const chromium = pw.chromium || (pw.default && pw.default.chromium);

const URL = process.env.CHALK_URL || 'http://localhost:8731/Chalk%20Play%20Editor.dc.html';
const results = [];
const check = (name, ok, note) => { results.push({ name, ok }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`); };

const plays = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fpd.plays.v1') || '[]'));
const cur = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fpd.current.v1') || '{}'));
const clean = async (p) => !/unsaved/i.test(await p.locator('body').innerText());
const guard = (p) => p.getByRole('dialog', { name: 'Unsaved changes' });
const shown = async (p) => await guard(p).isVisible().catch(() => false);

const openPlay = async (p, name) => {
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(250);
  await p.keyboard.type('Open: ' + name.slice(0, 12)); await p.waitForTimeout(350);
  await p.keyboard.press('Enter'); await p.waitForTimeout(700);
};
const makeDirty = async (p) => {
  const c = await p.locator('svg circle').all();
  await c[Math.floor(c.length / 2)].click({ force: true });
  await p.waitForTimeout(150); await p.keyboard.press('Meta+d'); await p.waitForTimeout(350);
};
// ⌘S opens the save menu on a play that already exists; it saves outright on one that doesn't
const save = async (p) => {
  await p.keyboard.press('Meta+s'); await p.waitForTimeout(500);
  const menu = p.getByRole('button', { name: /^Save play$|^Save$/ }).first();
  if (await menu.isVisible().catch(() => false)) { await menu.click(); await p.waitForTimeout(800); }
  else await p.waitForTimeout(500);
};

const browser = await chromium.launch();
const errors = [];
const newPage = async () => {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForSelector('svg', { timeout: 20000 });
  await p.waitForTimeout(1200);
  return p;
};

// ---------------------------------------------------------------- B1
// A demo handed to the editor must become a new unsaved play. Saving it must never
// touch the record that was open beforehand — not by id, and not by name either:
// the demos ship under the same names as the seeded examples.
console.log('\nB1 — demo handoff does not overwrite the open play');
for (const [demo, label] of [['Defense', 'demo name not in library'], [null, 'demo name collides with a library play']]) {
  const p = await newPage();
  const lib = await plays(p);
  await openPlay(p, lib[0].name);
  const openId = (await cur(p)).curPlayId;
  const before = await plays(p);
  const sigBefore = JSON.stringify(before.find(x => x.id === openId));

  await p.getByRole('button', { name: 'Demo', exact: true }).click(); await p.waitForTimeout(900);
  if (demo) { await p.getByRole('button', { name: demo, exact: true }).click(); await p.waitForTimeout(900); }
  await p.getByRole('button', { name: 'Open this play in the editor', exact: true }).click();
  await p.waitForTimeout(900);

  const after = await cur(p);
  check(`[${label}] curPlayId cleared on handoff`, after.curPlayId === null);
  check(`[${label}] handoff marks the document unsaved`, !(await clean(p)));

  await save(p);
  const list = await plays(p);
  check(`[${label}] previously open record byte-for-byte unchanged`,
    JSON.stringify(list.find(x => x.id === openId)) === sigBefore);
  check(`[${label}] save created a new record`, list.length === before.length + 1,
    `${before.length} -> ${list.length}`);
  await p.close();
}

// ---------------------------------------------------------------- B2
// Replacing the whole document with unsaved work on the field must ask first.
console.log('\nB2 — switching plays guards unsaved work');
{
  const p = await newPage();
  const lib = await plays(p);
  await makeDirty(p);
  await openPlay(p, lib[1].name);
  check('guard appears when switching with unsaved work', await shown(p));

  const before = await p.locator('svg circle').count();
  await guard(p).getByText('Cancel').click(); await p.waitForTimeout(400);
  check('Cancel dismisses the guard', !(await shown(p)));
  check('Cancel leaves the document untouched', (await p.locator('svg circle').count()) === before);
  check('Cancel leaves the document still unsaved', !(await clean(p)));

  await openPlay(p, lib[1].name);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('Escape cancels the guard', !(await shown(p)));

  await openPlay(p, lib[1].name);
  await guard(p).getByText('Discard changes').click(); await p.waitForTimeout(800);
  check('Discard proceeds with the switch', !(await shown(p)) && await clean(p));
  const hist = await p.evaluate(() => JSON.parse(localStorage.getItem('fpd.history.v1') || '{}'));
  check('Discard leaves a history snapshot behind',
    Object.values(hist).flat().some(s => /Before opening another play/.test(s.label || '')));

  await openPlay(p, lib[2].name);
  check('a clean switch does not prompt', !(await shown(p)));
  await p.close();
}

// ---------------------------------------------------------------- regressions
console.log('\nRegressions — ordinary saving is unaffected');
{
  const p = await newPage();
  const lib = await plays(p);
  await openPlay(p, lib[0].name);
  const n0 = (await plays(p)).length;
  const sizeBefore = JSON.stringify((await plays(p)).find(x => x.name === lib[0].name).doc).length;
  await makeDirty(p);
  await save(p);
  const l1 = await plays(p);
  check('saving an opened play does not duplicate it', l1.length === n0, `${n0} -> ${l1.length}`);
  check('saving an opened play returns to a saved state', await clean(p));
  check('saving an opened play actually writes the edit',
    JSON.stringify(l1.find(x => x.name === lib[0].name).doc).length !== sizeBefore);

  const beforeReload = (await plays(p)).length;
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('svg'); await p.waitForTimeout(1300);
  check('library survives reload', (await plays(p)).length === beforeReload);
  await p.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed · ${errors.length} page errors`);
errors.slice(0, 5).forEach(e => console.log('  ' + e));
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
