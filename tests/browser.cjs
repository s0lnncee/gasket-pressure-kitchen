/* Black-box browser regressions. Supply Playwright separately; the app has no dependencies. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
let browser;
before(async () => { browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); });
after(async () => { await browser?.close(); });
const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
async function open(t, options = {}, init) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, ...options });
  if (init) await context.addInitScript(init);
  const page = await context.newPage(); const errors = []; const network = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.clock.install({ time: 0 }); await page.clock.pauseAt(1000);
  await page.goto(url); await page.clock.runFor(32);
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'browser errors'); assert.deepEqual(network, [], 'runtime network requests'); });
  return page;
}
const read = page => page.evaluate(() => ({
  state: document.querySelector('#console').dataset.state,
  zone: document.querySelector('#console').dataset.zone,
  pressure: Number(document.querySelector('#pressure').textContent),
  score: Number(document.querySelector('#score').textContent),
  progress: document.querySelector('#cook-progress').value,
  target: document.querySelector('#cook-progress').max,
  venting: document.querySelector('#lever').getAttribute('aria-pressed') === 'true',
  stage: document.querySelector('#order-number').textContent
}));
async function capture(page, name) {
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name + '.png'), animations: 'disabled' });
}
async function start(page) { await page.locator('#primary').click(); await page.clock.runFor(32); }
async function cook(page) {
  let held = false;
  for (let i = 0; i < 450; i++) {
    const state = await read(page);
    if (state.state !== 'cooking') { await page.keyboard.up('Space'); return state; }
    if (state.pressure >= 79 && !held) { await page.keyboard.down('Space'); held = true; }
    if (state.pressure <= 71 && held) { await page.keyboard.up('Space'); held = false; }
    await page.clock.runFor(100);
  }
  assert.fail('order did not finish within 45 seconds');
}

test('start screen waits indefinitely, keyboard activation starts cooking, and Canvas renders', async t => {
  const page = await open(t); const initial = await read(page); await page.clock.runFor(30000);
  assert.deepEqual(await read(page), initial); assert.equal(initial.state, 'ready');
  await capture(page, 'start-desktop');
  await page.keyboard.press('Enter'); await page.clock.runFor(3000);
  const state = await read(page); assert.equal(state.state, 'cooking'); assert.ok(state.progress > 1); assert.ok(state.score > 10);
  assert.ok(await page.locator('canvas').first().evaluate(c => c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data[3] > 0));
  await capture(page, 'gameplay-desktop');
});
test('Space and mouse vent immediately; overlapping inputs and outside release do not stick', async t => {
  const page = await open(t); await start(page); await page.clock.runFor(3000);
  const pressure = (await read(page)).pressure;
  await page.keyboard.down('Space'); await page.clock.runFor(100); assert.equal((await read(page)).venting, true);
  await page.clock.runFor(900); assert.ok((await read(page)).pressure < pressure - 7);
  const box = await page.locator('#lever').boundingBox(); await page.mouse.move(box.x+30, box.y+30); await page.mouse.down();
  await page.keyboard.up('Space'); await page.clock.runFor(100); assert.equal((await read(page)).venting, true);
  await page.mouse.move(5,5); await page.mouse.up(); await page.clock.runFor(32); assert.equal((await read(page)).venting, false);
  const released = (await read(page)).pressure; await page.clock.runFor(1000); assert.ok((await read(page)).pressure > released);
});
test('all orders complete through actual controls; transitions freeze; victory and overtime work', async t => {
  const page = await open(t); await start(page);
  for (let stage = 0; stage < 3; stage++) {
    assert.equal((await read(page)).target, [15,18,20][stage]);
    await page.clock.runFor(3000); await capture(page, `stage-${stage+1}`);
    const result = await cook(page); assert.equal(result.state, stage === 2 ? 'victory' : 'served');
    assert.equal(result.progress, result.target); assert.ok(result.score > [150,330,530][stage]);
    await page.clock.runFor(1000); await capture(page, stage === 2 ? 'victory' : `order-${stage+1}-served`);
    const frozen = await read(page); await page.clock.runFor(5000); assert.deepEqual(await read(page), frozen);
    if (stage < 2) { await start(page); assert.equal((await read(page)).pressure, 55); assert.equal((await read(page)).progress, 0); }
  }
  const score = (await read(page)).score; await start(page);
  assert.equal((await read(page)).stage, 'OVERTIME'); await page.clock.runFor(1000);
  assert.ok((await read(page)).score > score); await capture(page, 'overtime');
});
test('100 PSI shows Game Over and final score; Play again resets the full shift', async t => {
  const page = await open(t); await start(page); await page.clock.runFor(10000);
  const result = await read(page); assert.equal(result.state, 'over'); assert.equal(result.pressure, 100);
  assert.equal(await page.locator('#overlay-title').textContent(), 'Game Over');
  assert.equal(Number(await page.locator('#final-score').textContent()), result.score);
  await capture(page, 'game-over'); await page.locator('#primary').click(); await page.clock.runFor(32);
  const reset = await read(page); assert.equal(reset.state, 'cooking'); assert.equal(reset.pressure,55); assert.equal(reset.score,0); assert.equal(reset.progress,0);
});
test('blur and hidden-tab events pause safely, and resuming never retains a held key', async t => {
  const page = await open(t); await start(page); await page.clock.runFor(3000); await page.keyboard.down('Space');
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); const paused = await read(page);
  assert.equal(paused.state, 'paused'); assert.equal(paused.venting, false); await page.clock.runFor(10000); assert.deepEqual(await read(page), paused);
  await page.keyboard.up('Space'); await page.keyboard.press('Enter'); await page.clock.runFor(1000);
  assert.equal((await read(page)).state, 'cooking'); assert.ok((await read(page)).pressure > paused.pressure);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal((await read(page)).state, 'paused');
});
test('P pauses and resumes; Enter operates the lever and modal keyboard focus stays visible', async t => {
  const page = await open(t); await page.keyboard.press('Tab'); assert.equal(await page.locator('#primary').evaluate(e=>e===document.activeElement), true);
  await page.keyboard.press('Space'); await page.clock.runFor(3000);
  await page.keyboard.down('Enter'); await page.clock.runFor(300); assert.equal((await read(page)).venting, true);
  await page.keyboard.up('Enter'); await page.keyboard.press('KeyP'); assert.equal((await read(page)).state, 'paused');
  await page.keyboard.press('KeyP'); await page.clock.runFor(100); assert.equal((await read(page)).state, 'cooking'); assert.equal((await read(page)).venting, false);
});
test('touch hold vents, release/cancel clears it, and scrolling is not triggered', async t => {
  const page = await open(t, { viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await page.locator('#primary').tap(); await page.clock.runFor(3000);
  const box = await page.locator('#lever').boundingBox(); const x=box.x+box.width/2, y=box.y+box.height/2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]}); await page.clock.runFor(1000);
  assert.equal((await read(page)).venting,true); assert.ok((await read(page)).pressure < 65);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await page.clock.runFor(32); assert.equal((await read(page)).venting,false);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]}); await page.clock.runFor(100);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}); await page.clock.runFor(32); assert.equal((await read(page)).venting,false);
  assert.equal(await page.evaluate(()=>scrollY),0);
});
for (const [width,height] of [[320,568],[390,844],[768,1024],[844,390]]) {
  test(`objective, pressure and lever fit the initial ${width}×${height} viewport`, async t => {
    const page = await open(t,{viewport:{width,height},hasTouch:true});
    assert.ok(await page.locator('#primary').isVisible()); await start(page); await page.clock.runFor(3000);
    const layout = await page.evaluate(()=>({
      width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
      boxes:['#pressure','#lever','.order-ticket'].map(s=>document.querySelector(s).getBoundingClientRect().toJSON())
    }));
    assert.ok(layout.scrollWidth <= width, 'horizontal overflow'); assert.ok(layout.scrollHeight <= height, 'vertical overflow');
    for (const box of layout.boxes) { assert.ok(box.top>=0 && box.bottom<=height, 'essential control outside viewport'); assert.ok(box.left>=0 && box.right<=width); }
    assert.ok(layout.boxes[1].height>=44 && layout.boxes[1].width>=44);
    await capture(page, `gameplay-${width}x${height}`);
  });
}
test('blocked local storage cannot prevent start, failure, or restart', async t => {
  const page = await open(t,{},()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}}));
  await start(page); await page.clock.runFor(10000); assert.equal((await read(page)).state,'over');
  await start(page); assert.equal((await read(page)).state,'cooking');
});
test('reduced-motion preference suppresses CSS motion while the gauge and scoring work', async t => {
  const page = await open(t,{reducedMotion:'reduce'}); await start(page); await page.clock.runFor(3000);
  assert.ok((await read(page)).score>0);
  assert.equal(await page.locator('#moment').evaluate(e=>getComputedStyle(e).animationName),'none');
});
test('optional synthesized audio toggles without changing gameplay', async t => {
  const page = await open(t); await page.locator('#sound').click();
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
  await page.locator('#sound').click(); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
  assert.equal((await read(page)).state,'ready');
});
