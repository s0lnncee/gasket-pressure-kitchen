import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(readFileSync(new URL('../src/sim.js', import.meta.url), 'utf8'), context);
const { create, step, score, SETTINGS: C } = context.KitchenPhysics;
const cooking = () => ({ ...create(), phase: 'cooking' });
function advance(state, seconds, venting = false) {
  for (let i = 0; i < Math.round(seconds / C.step); i++) {
    step(state, C.step, venting);
  }
}

const rising = cooking();
advance(rising, 1);
assert.ok(rising.pressure > C.initialPSI, 'unvented pressure rises');
assert.ok(rising.velocity > 0);
const vented = cooking();
advance(vented, 1, true);
assert.ok(vented.pressure < C.initialPSI, 'venting lowers pressure');
assert.ok(vented.lever > 0.95, 'lever responds within a second');
const inertial = cooking();
advance(inertial, 1);
const before = inertial.pressure;
step(inertial, C.step, true);
assert.ok(inertial.pressure > before, 'pressure momentum persists on initial press');
assert.ok(inertial.lever > 0 && inertial.lever < 1, 'lever travel is eased');
advance(vented, 30, true);
assert.equal(vented.pressure, 0, 'pressure clamps at zero');
assert.ok(vented.velocity >= 0, 'no hidden negative momentum at zero');
assert.ok(vented.lever <= 1 && vented.lever >= 0);
const scoring = cooking();
scoring.pressure = 75;
for (let i = 0; i < 5 * C.comboSeconds / C.step; i++) score(scoring, C.step);
assert.equal(scoring.combo, C.comboMax, 'continuous zone time raises combo');
assert.ok(scoring.score > C.pointsPerSecond * 5 * C.comboSeconds);
for (const pressure of [C.zoneLow, C.zoneHigh]) {
  scoring.pressure = pressure;
  score(scoring, C.step);
  assert.ok(scoring.inZone, 'zone boundaries are inclusive');
}
scoring.pressure = 86;
const earned = scoring.score;
score(scoring, C.step);
assert.equal(scoring.score, earned);
assert.equal(scoring.combo, 1, 'leaving zone resets combo');
assert.equal(scoring.zoneTime, 0);
const exploded = cooking();
exploded.pressure = 99.99;
exploded.velocity = 30;
exploded.score = 123.9;
step(exploded, C.step, false);
assert.equal(exploded.phase, 'gameover');
assert.equal(exploded.pressure, 100);
assert.equal(exploded.best, 123);
const reset = create(exploded.best);
assert.equal(reset.phase, 'ready');
assert.equal(reset.pressure, C.initialPSI);
assert.equal(reset.score, 0);
assert.equal(reset.best, 123);
assert.equal(reset.lever, 0);
assert.equal(reset.elapsed, 0);

// Policies use sampled observations, not privileged control of pressure or heat.
function runPolicy(interval, policy) {
  const state = cooking();
  let nextDecision = 0;
  let held = false;
  while (state.phase === 'cooking' && state.elapsed < 240) {
    if (state.elapsed >= nextDecision) {
      held = policy(state, held);
      nextDecision += interval;
    }
    step(state, C.step, held);
  }
  return state;
}
const idle = runPolicy(1, () => false);
const reasonable = runPolicy(0.45, (s, held) => s.pressure > 83 ? true : s.pressure < 67 ? false : held);
const expert = runPolicy(0.08, s => s.pressure + s.velocity * 0.5 > 76);
assert.ok(reasonable.elapsed > idle.elapsed * 4, 'ordinary reactions substantially outperform idle play');
assert.ok(reasonable.score > idle.score * 3);
assert.ok(expert.elapsed > 90, 'expert can reach a long run');
assert.ok(expert.score > reasonable.score, 'anticipation rewards zone control');
assert.ok(expert.elapsed < 200 && expert.phase === 'gameover', 'uncapped difficulty ends expert runs');
assert.ok(expert.heat > reasonable.heat || expert.elapsed >= reasonable.elapsed - 10);
console.log('Physics checks passed: rise, venting, inertia, clamps, scoring, combo, blowout, reset.');
for (const [name, state] of [['idle', idle], ['reasonable', reasonable], ['expert', expert]]) {
  console.log(`${name}: ${state.elapsed.toFixed(1)}s, ${Math.floor(state.score)} points, final heat ${state.heat.toFixed(1)}`);
}
