const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../engine.js');
const { Kitchen, RULES, ORDERS } = globalThis.PressureKitchen;
const started = () => { const game = new Kitchen(); game.start(); return game; };
const advance = (game, seconds, fps = 60) => { for (let i = 0; i < Math.round(seconds * fps); i++) game.advance(1 / fps); };
function cookOrder(game, fps = 60) {
  for (let i = 0; i < 90 * fps && game.state === 'cooking'; i++) {
    if (game.pressure >= 80) game.setVenting(true);
    if (game.pressure <= 70) game.setVenting(false);
    game.advance(1 / fps);
  }
  assert.ok(['served', 'victory'].includes(game.state), `order did not finish: ${game.state}`);
}
function win() { const game = started(); for (let i = 0; i < 3; i++) { cookOrder(game); if (i < 2) game.nextOrder(); } return game; }

test('explicit Start is required; a waiting player loses no pressure, time or score', () => {
  const game = new Kitchen(); const initial = { ...game };
  game.setVenting(true); advance(game, 60); assert.deepEqual({ ...game }, initial);
  game.start(); advance(game, 1); assert.ok(game.pressure > 55);
});
test('cooking raises pressure; unattended pod reaches 100 and becomes immutable', () => {
  const game = started(); advance(game, 1); assert.ok(game.pressure > 60 && game.pressure < 61);
  advance(game, 10); assert.equal(game.pressure, 100); assert.equal(game.state, 'over');
  const result = { ...game }; game.setVenting(true); game.resume(); game.nextOrder(); game.continueOvertime(); game.start(); advance(game, 20);
  assert.deepEqual({ ...game }, result);
});
test('holding vents, releasing reheats, and pressure cannot fall below zero', () => {
  const game = started(); game.setVenting(true); advance(game, 2); assert.ok(game.pressure < 40);
  game.setVenting(false); const low = game.pressure; advance(game, 1); assert.ok(game.pressure > low);
  game.setVenting(true); advance(game, 20); assert.equal(game.pressure, 0); assert.equal(game.score, 0); assert.equal(game.state, 'cooking');
});
test('zone scoring includes only the exact fraction of steps crossing 65 or 85', () => {
  const game = started(); game.pressure = 70; advance(game, 1); assert.equal(game.score, 10);
  assert.ok(Math.abs(game.progress - 1) < 1e-9);
  game.pressure = 64.99; const low = game.progress; game.advance(1 / 120);
  assert.ok(game.progress > low && game.progress < low + 1 / 120);
  game.pressure = 85.01; game.setVenting(true); const high = game.progress; game.advance(1 / 120);
  assert.ok(game.progress > high && game.progress < high + 1 / 120);
});
test('leaving the zone freezes accumulated cooking progress, then resumes without resetting', () => {
  const game = started(); game.pressure = 70; advance(game, 1); const progress = game.progress;
  game.pressure = 90; advance(game, .5); assert.equal(game.progress, progress);
  game.pressure = 40; advance(game, 1); assert.equal(game.progress, progress);
  game.pressure = 70; advance(game, 1); assert.ok(Math.abs(game.progress - progress - 1) < 1e-9);
});
test('30, 60 and 144 Hz produce identical pressure and scoring for equivalent input', () => {
  const states = [30, 60, 144].map(fps => {
    const game = started(); advance(game, 3, fps); game.setVenting(true); advance(game, 1, fps);
    game.setVenting(false); advance(game, 2, fps); return [game.pressure, game.score, game.progress, game.elapsed];
  });
  assert.deepEqual(states[0], states[1]); assert.deepEqual(states[0], states[2]);
});
test('the whole three-order campaign is frame-rate independent', () => {
  const results = [30, 60, 144].map(fps => {
    const game = started();
    // Use a fixed 100 ms control cadence independent of the rendering frequency.
    for (let order = 0; order < 3; order++) {
      while (game.state === 'cooking') {
        if (game.pressure >= 80) game.setVenting(true);
        if (game.pressure <= 70) game.setVenting(false);
        for (let frame = 0; frame < fps; frame++) game.advance(.1 / fps);
      }
      if (order < 2) game.nextOrder();
    }
    return [game.state, game.score, game.elapsed, game.zoneTime, game.serviceBonus];
  });
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[0], results[2]);
});
test('pause clears venting and freezes all shift and stage progress until explicit resume', () => {
  const game = started(); advance(game, 3); game.setVenting(true); game.pause(); const snapshot = { ...game };
  advance(game, 20); game.setVenting(true); assert.deepEqual({ ...game }, snapshot);
  game.resume(); advance(game, 1); assert.ok(game.pressure > snapshot.pressure); assert.equal(game.venting, false);
});
test('restart resets all transient campaign and overtime state', () => {
  const game = win(); game.continueOvertime(); game.setVenting(true); advance(game, 2); game.pause(); game.reset();
  assert.deepEqual(game, new Kitchen()); game.start(); advance(game, 20); game.reset(); assert.deepEqual(game, new Kitchen());
});
test('invalid time deltas are ignored and long frame gaps are capped', () => {
  const game = started(); const initial = { ...game };
  for (const dt of [NaN, Infinity, -1, 0]) game.advance(dt);
  assert.deepEqual({ ...game }, initial); game.advance(3600); assert.ok(game.elapsed <= .101); assert.equal(game.state, 'cooking');
});
test('all three orders require exactly 15, 18 and 20 accumulated seconds', () => {
  const game = started();
  for (let i = 0; i < 3; i++) {
    assert.equal(game.stage, i); assert.equal(game.order.target, [15, 18, 20][i]);
    cookOrder(game); assert.equal(game.progress, [15, 18, 20][i]); assert.equal(game.completed, i + 1);
    assert.equal(game.state, i < 2 ? 'served' : 'victory'); if (i < 2) game.nextOrder();
  }
  assert.ok(Math.abs(game.zoneTime - 53) < 1e-8);
});
test('handoffs freeze physics and scoring; next order starts fresh without losing totals', () => {
  const game = started(); cookOrder(game); const snapshot = { ...game }; const score = game.score;
  game.setVenting(true); advance(game, 100); assert.deepEqual({ ...game }, snapshot); assert.equal(game.score, score);
  game.nextOrder(); assert.equal(game.stage, 1); assert.equal(game.state, 'cooking'); assert.equal(game.pressure, 55);
  assert.equal(game.progress, 0); assert.equal(game.stageElapsed, 0); assert.equal(game.score, score); assert.equal(game.venting, false);
  game.nextOrder(); assert.equal(game.stage, 1);
});
test('each stage has announced constant heat; venting always wins, including overtime', () => {
  const game = started();
  for (let i = 0; i < 3; i++) {
    assert.equal(game.heatRate, [5.4, 6.6, 7.8][i]); cookOrder(game);
    assert.equal(game.heatRate, [5.4, 6.6, 7.8][i]); if (i < 2) game.nextOrder();
  }
  game.continueOvertime(); game.overtimeElapsed = 100000;
  assert.equal(game.heatRate, 8.8); assert.ok(game.heatRate < RULES.ventRate);
});
test('100 PSI ends every stage and overtime; it never serves or awards a bonus', () => {
  for (const stage of [0, 1, 2]) {
    const game = started(); game.stage = stage; game.pressure = 99.99; game.advance(1 / 120);
    assert.equal(game.state, 'over'); assert.equal(game.pressure, 100); assert.equal(game.completed, 0); assert.equal(game.serviceBonus, 0);
  }
  const game = win(); game.continueOvertime(); game.pressure = 99.99; game.advance(1 / 120); assert.equal(game.state, 'over');
});
test('victory is stable and requires explicit overtime; completed orders cannot be awarded twice', () => {
  const game = win(); const snapshot = { ...game }; const score = game.score;
  game.nextOrder(); game.resume(); game.start(); advance(game, 30); assert.deepEqual({ ...game }, snapshot);
  game.continueOvertime(); assert.equal(game.state, 'cooking'); assert.equal(game.overtime, true);
  assert.equal(game.score, score); assert.equal(game.pressure, 65); assert.equal(game.completed, 3);
  const before = { ...game }; game.continueOvertime(); assert.deepEqual({ ...game }, before);
});
test('service bonuses reward zone efficiency and are awarded once per completed order', () => {
  const game = started(); cookOrder(game); const bonus = Math.floor(100 * 15 / game.stageElapsed);
  assert.equal(game.lastBonus, bonus); assert.equal(game.serviceBonus, bonus); assert.equal(game.score, 150 + bonus);
  assert.ok(bonus > 0 && bonus <= 100); advance(game, 10); assert.equal(game.serviceBonus, bonus);
});
test('three minutes of overtime remains controllable, continues scoring and never adds stages', () => {
  const game = win(); game.continueOvertime(); const score = game.score; const bonus = game.serviceBonus;
  for (let i = 0; i < 180 * 60; i++) {
    if (game.pressure >= 80) game.setVenting(true);
    if (game.pressure <= 70) game.setVenting(false);
    game.advance(1 / 60);
  }
  assert.equal(game.state, 'cooking'); assert.ok(game.score > score + 1750); assert.equal(game.completed, 3);
  assert.equal(game.serviceBonus, bonus); assert.equal(game.stage, 2);
});
test('invalid navigation cannot skip orders or enter overtime early', () => {
  const game = new Kitchen(); game.nextOrder(); game.continueOvertime(); game.resume(); assert.deepEqual(game, new Kitchen());
  game.start(); const snapshot = { ...game }; game.nextOrder(); game.continueOvertime(); game.start(); assert.deepEqual({ ...game }, snapshot);
  assert.ok(Object.isFrozen(ORDERS) && ORDERS.every(Object.isFrozen));
});
