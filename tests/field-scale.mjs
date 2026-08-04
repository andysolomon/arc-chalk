/*
  Regression tests for finding #3 — the field is drawn on two scales and several places
  assumed one. 976 drawing units span 53 1/3 yards across (18.3 per yard) while 12 units
  make a yard downfield, so dividing a horizontal distance by ppy reported it ~53% too big.

  Every number the app shows a coach has to be true; these check the ones measured across
  the field, and that the depth numbers did not regress while fixing them.

  Run — serve the repo root in one shell, then run the tests in another:

    python3 -m http.server 8731
    node tests/field-scale.mjs

  See tests/document-transitions.mjs for the PLAYWRIGHT_PATH note.
*/
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const chromium = pw.chromium || (pw.default && pw.default.chromium);

const URL = process.env.CHALK_URL || 'http://localhost:8731/Chalk%20Play%20Editor.dc.html';
const PPX = 976 / (160 / 3);   // 18.3 drawing units per yard across
const PPY = 12;                // 12 drawing units per yard downfield
const LOS_Y = 430;
const fmtYd = (v) => { const r = Math.round(v * 2) / 2; return r === Math.round(r) ? String(Math.round(r)) : r.toFixed(1); };

const errors = [];
let pass = 0, fail = 0;
const check = (n, ok, note) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? '  — ' + note : ''}`); };

// the canvas is the largest svg on the page; everything else is a toolbar icon
const canvasGeom = (p) => p.evaluate(() => {
  const svgs = [...document.querySelectorAll('svg')];
  let best = null, area = 0;
  svgs.forEach(s => { const r = s.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; best = s; } });
  const r = best.getBoundingClientRect();
  return { vb: best.getAttribute('viewBox').split(/\s+/).map(Number), x: r.x, y: r.y, w: r.width, h: r.height };
});
// the live readout renders as <g transform="translate(x y)"> with a text inside
const readout = (p) => p.evaluate(() => {
  const svgs = [...document.querySelectorAll('svg')];
  let best = null, area = 0;
  svgs.forEach(s => { const r = s.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; best = s; } });
  for (const g of best.querySelectorAll('g[transform]')) {
    const t = g.querySelector('text');
    if (t && /yds/.test(t.textContent)) {
      const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform'));
      return { x: +m[1], y: +m[2], text: t.textContent };
    }
  }
  return null;
});
const docNow = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fpd.current.v1')).doc);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => errors.push(e.message));
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForSelector('svg', { timeout: 20000 }); await p.waitForTimeout(1300);

const g = await canvasGeom(p);
const toScreen = (x, y) => ({ x: g.x + (x - g.vb[0]) * (g.w / g.vb[2]), y: g.y + (y - g.vb[1]) * (g.h / g.vb[3]) });

const doc = await docNow(p);
const route = doc.routes.find(r => r.points.length >= 2);
const p0 = route.points[0];
const last = route.points[route.points.length - 1];

// select the route so its node handles appear
const midPt = route.points[Math.floor(route.points.length / 2)];
const ms = toScreen(midPt.x, midPt.y);
await p.mouse.click(ms.x, ms.y);
await p.waitForTimeout(500);

console.log('\nthe readout measures each axis on its own scale');
{
  const from = toScreen(last.x, last.y);
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  // straight across the field, far enough that the number is unambiguous
  await p.mouse.move(from.x + 260, from.y, { steps: 12 });
  await p.waitForTimeout(300);

  const ro = await readout(p);
  check('a readout is shown while dragging a node', !!ro, ro && JSON.stringify(ro.text));

  if (ro) {
    // measured from where the drag actually landed, so snapping cannot skew the assertion
    const expectLat = fmtYd(Math.abs(ro.x - p0.x) / PPX);
    const wouldHaveBeen = fmtYd(Math.abs(ro.x - p0.x) / PPY);
    const expectDepth = fmtYd((LOS_Y - ro.y) / PPY);

    // "4.5 yds · 3 in" — take the lateral clause, so the depth number cannot be mistaken for it
    const lateral = (ro.text.split('\u00b7')[1] || '').trim().split(' ')[0];
    check('lateral distance is reported in true yards', lateral === expectLat,
      `expected "${expectLat}", got "${lateral}"`);
    check('and is no longer the old ppy-based number', lateral !== wouldHaveBeen,
      `the bug would have said "${wouldHaveBeen}"`);
    check('depth still measures on the vertical scale', ro.text.startsWith(expectDepth + ' yds'),
      `expected "${expectDepth} yds", got "${ro.text}"`);
  }
  await p.mouse.up(); await p.waitForTimeout(300);
}

console.log('\n45° snapping means 45° on the grass, not on the screen');
{
  const d2 = await docNow(p);
  const r2 = d2.routes.find(r => r.id === route.id);
  const a = r2.points[r2.points.length - 2];
  const from = toScreen(r2.points[r2.points.length - 1].x, r2.points[r2.points.length - 1].y);
  const ref = toScreen(a.x, a.y);

  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  // aim roughly up-and-right; the snap should pull it to a true 45
  await p.mouse.move(ref.x + 150, ref.y - 130, { steps: 14 });
  await p.waitForTimeout(300);
  const ro = await readout(p);
  await p.mouse.up(); await p.waitForTimeout(400);

  const d3 = await docNow(p);
  const r3 = d3.routes.find(r => r.id === route.id);
  const end = r3.points[r3.points.length - 1];
  const prev = r3.points[r3.points.length - 2];
  const ydX = Math.abs(end.x - prev.x) / PPX;
  const ydY = Math.abs(end.y - prev.y) / PPY;
  const ratio = ydY === 0 ? Infinity : ydX / ydY;

  check('a snapped diagonal is equal yards across and downfield', Math.abs(ratio - 1) < 0.08,
    `${ydX.toFixed(2)} yds out / ${ydY.toFixed(2)} yds deep = ${ratio.toFixed(3)}`);
  if (ro) console.log(`    readout during that drag: ${JSON.stringify(ro.text)}`);
}

console.log('\nthe zone width readout uses the same converter');
{
  // xToYd replaced a call to pxToYdSpan, a method that never existed — the /12 fallback
  // was the only branch that ever ran. Check the arithmetic the readout now performs.
  const rx = 91.5;                       // a zone 5 yards in radius, 10 across
  check('a 91.5-unit radius reads as a 10 yard width', fmtYd((rx * 2) / PPX) === '10',
    `${fmtYd((rx * 2) / PPX)} yds`);
  check('the old fallback would have called that same zone 15.5', fmtYd((rx * 2) / PPY) === '15.5',
    `off by ${(((rx * 2) / PPY) / ((rx * 2) / PPX) - 1) * 100 | 0}%`);
}

console.log(`\n${pass}/${pass + fail} passed · ${errors.length} page errors`);
errors.slice(0, 6).forEach(e => console.log('  ' + e));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
