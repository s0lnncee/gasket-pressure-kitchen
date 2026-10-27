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
// Equal observation windows isolate a short correction from a sustained pull.
const tap = cooking();
const hold = cooking();
const unvented = cooking();
for (const state of [tap, hold, unvented]) state.elapsed = 20;
advance(tap, 0.15, true);
advance(tap, 0.85, false);
advance(hold, 1, true);
advance(unvented, 1, false);
const tapCorrection = unvented.pressure - tap.pressure;
const holdCorrection = unvented.pressure - hold.pressure;
assert.ok(tapCorrection > 0, 'a short tap makes a useful correction');
assert.ok(tapCorrection < holdCorrection * 0.5, 'holding vents substantially harder than tapping');
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
  let minimumPressure = state.pressure;
  while (state.phase === 'cooking' && state.elapsed < 240) {
    if (state.elapsed >= nextDecision) {
      held = policy(state, held);
      nextDecision += interval;
    }
    step(state, C.step, held);
    minimumPressure = Math.min(minimumPressure, state.pressure);
  }
  return { ...state, minimumPressure };
}
const idle = runPolicy(1, () => false);
const tapping = runPolicy(C.step, s => s.elapsed % 0.4 < 0.15);
const reasonable = runPolicy(0.45, (s, held) => s.pressure > 83 ? true : s.pressure < 67 ? false : held);
const expert = runPolicy(0.08, s => s.pressure + s.velocity * 0.5 > 76);
assert.ok(idle.elapsed >= 8 && idle.elapsed <= 10, 'opening ignition gives 8–10 seconds before idle blowout');
assert.ok(tapping.minimumPressure > 40, '150 ms taps every 400 ms never drain the boiler');
assert.ok(tapping.elapsed > idle.elapsed * 2, 'repeated taps extend the initial run');
assert.ok(reasonable.elapsed > idle.elapsed * 4, 'ordinary reactions substantially outperform idle play');
assert.ok(reasonable.score > idle.score * 3);
assert.ok(expert.elapsed > 90, 'expert can reach a long run');
assert.ok(expert.score > reasonable.score, 'anticipation rewards zone control');
assert.ok(expert.elapsed < 200 && expert.phase === 'gameover', 'uncapped difficulty ends expert runs');
assert.ok(expert.heat > reasonable.heat || expert.elapsed >= reasonable.elapsed - 10);
console.log('Physics checks passed: rise, venting, inertia, clamps, scoring, combo, blowout, reset.');
for (const [name, state] of [['idle', idle], ['tapping', tapping], ['reasonable', reasonable], ['expert', expert]]) {
  console.log(`${name}: ${state.elapsed.toFixed(1)}s, ${Math.floor(state.score)} points, final heat ${state.heat.toFixed(1)}`);
}
