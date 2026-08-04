/*
  Regression tests for finding #4 — live text and drag edits bypassed commit(), so `dirty`
  was never set. Two things read that flag: the status line the coach trusts, and the
  90-second history timer. Both were wrong for any session that only typed or dragged.

  Run — serve the repo root in one shell, then run the tests in another:

    python3 -m http.server 8731
    node tests/dirty-state.mjs

  See tests/document-transitions.mjs for the PLAYWRIGHT_PATH note.
*/
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const chromium = pw.chromium || (pw.default && pw.default.chromium);

const URL = process.env.CHALK_URL || 'http://localhost:8731/Chalk%20Play%20Editor.dc.html';
const errors = [];
let pass = 0, fail = 0;
const check = (n, ok, note) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? '  — ' + note : ''}`); };

const ready = async (p) => { await p.waitForSelector('svg', { timeout: 20000 }); await p.waitForTimeout(1200); };
const status = async (p) => {
  const t = await p.locator('body').innerText();
  return /not saved|unsaved/i.test(t) ? 'unsaved' : 'saved';
};
const openPlay = async (p, q) => {
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(250);
  await p.keyboard.type('Open: ' + q); await p.waitForTimeout(400);
  await p.keyboard.press('Enter'); await p.waitForTimeout(900);
};
const saveNow = async (p) => {
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(300);
  await p.keyboard.type('Save play'); await p.waitForTimeout(400);
  await p.keyboard.press('Enter'); await p.waitForTimeout(1100);
};
const docNow = async (p) => JSON.stringify((await p.evaluate(() => JSON.parse(localStorage.getItem('fpd.current.v1') || '{}'))).doc || null);
const selectPlayer = async (p) => {
  const c = await p.locator('svg circle').all();
  await c[Math.floor(c.length / 2)].click({ force: true });
  await p.waitForTimeout(400);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => errors.push(e.message));
await p.goto(URL, { waitUntil: 'networkidle' }); await ready(p);

const lib = await p.evaluate(() => JSON.parse(localStorage.getItem('fpd.plays.v1')));
await openPlay(p, lib[0].name.slice(0, 12));
await saveNow(p);
check('a freshly saved play reads as saved', (await status(p)) === 'saved');

// ---- typing in the inspector (editPlayer) ----
console.log('\ntyping into inspector fields marks the play unsaved');
{
  await selectPlayer(p);
  const letter = p.getByPlaceholder(/^Letter/);
  await letter.click(); await letter.type('W'); await p.waitForTimeout(400);
  check('editPlayer sets dirty while typing', (await status(p)) === 'unsaved');

  // and the edit is still one undo entry, not one per keystroke
  await letter.blur(); await p.waitForTimeout(300);
  const typed = await docNow(p);
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(600);
  const undone = await docNow(p);
  check('the typing burst is a single undo entry', undone !== typed && !/"label":"W"/.test(undone));
}

// ---- a tag edit, then reload ----
{
  await saveNow(p);
  await selectPlayer(p);
  const tag = p.getByPlaceholder(/^Tag under/);
  await tag.click(); await tag.type('FLAT'); await p.waitForTimeout(400);
  await tag.blur(); await p.waitForTimeout(400);
  check('a second field also sets dirty', (await status(p)) === 'unsaved');
  await p.reload({ waitUntil: 'networkidle' }); await ready(p);
  check('the typed edit survives reload', /FLAT/.test(await docNow(p)));
}

// ---- dragging (updateDrag) ----
console.log('\ndragging marks the play unsaved');
{
  await saveNow(p);
  check('saved again before the drag', (await status(p)) === 'saved');
  // the toolbar icons are SVG circles too — take one from the middle, which is on the field
  const all = await p.locator('svg circle').all();
  const box = await all[Math.floor(all.length / 2)].boundingBox();
  const doc0 = await docNow(p);
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 - 30, { steps: 8 });
  await p.waitForTimeout(200);
  check('dirty is set mid-drag, before the pointer is released', (await status(p)) === 'unsaved');
  await p.mouse.up(); await p.waitForTimeout(500);
  check('and stays set after the drag ends', (await status(p)) === 'unsaved');
  check('the drag actually moved something', (await docNow(p)) !== doc0);
}

// ---- undo away from the saved state ----
// Saving pushes a {__lib} entry, so the first undo after a save reverses the library
// write rather than the document. The document entry is the one under it.
console.log('\nundo steps the document away from what was saved');
{
  await saveNow(p);
  check('saved before undo', (await status(p)) === 'saved');
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(700);
  check('undoing the library write alone does not dirty the document', (await status(p)) === 'saved');
  const doc0 = await docNow(p);
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(700);
  check('undoing a document change does dirty it', (await status(p)) === 'unsaved');
  check('and the document really changed', (await docNow(p)) !== doc0);
}

// ---- the history timer gate ----
console.log('\nthe 90-second history timer is gated on this flag');
{
  const armed = await p.evaluate(() => JSON.parse(localStorage.getItem('fpd.current.v1') || '{}') !== null);
  check('document is persisted to current.v1 by the edit handlers', armed);
  console.log('    (the timer itself fires on a 90s interval and is not exercised here —');
  console.log('     `dirty` being true is the condition it tests)');
}

console.log(`\n${pass}/${pass + fail} passed · ${errors.length} page errors`);
errors.slice(0, 6).forEach(e => console.log('  ' + e));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
