import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = {};
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const simulation = html.match(/<script id="sim">([\s\S]*?)<\/script>/)[1];
vm.runInNewContext(simulation, context);
const { create, step, score, SETTINGS: C, batch } = context.KitchenPhysics;
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

// Cumulative cooking survives time outside the band, while combo still resets.
const partial = cooking();
partial.pressure = 75;
score(partial, 3);
partial.pressure = 60;
score(partial, 2);
assert.equal(partial.cookTime, 3);
assert.equal(partial.combo, 1);
partial.pressure = 75;
score(partial, 2);
assert.equal(partial.cookTime, 5);

function finishBatch(state) {
  const index = state.batchIndex;
  for (let i = 0; i < Math.ceil(batch(state).seconds / C.step) + 2; i++) {
    if (state.phase !== 'cooking') break;
    state.pressure = (batch(state).low + batch(state).high) / 2;
    state.velocity = 0;
    step(state, C.step, false);
  }
  assert.equal(state.dishes, index + 1, 'a cooked batch increments dishes exactly once');
  assert.equal(state.cookTime, batch(state).seconds, 'cook timer clamps at its target');
}
const service = cooking();
finishBatch(service);
assert.equal(service.phase, 'batch', 'dish success has its own celebration phase');
assert.equal(service.dishes, 1);
assert.ok(service.score >= C.dishBonus);
const firstHeat = service.heat;
const firstWidth = batch(service).high - batch(service).low;
advance(service, C.batchPause + C.step);
assert.equal(service.batchIndex, 1);
assert.equal(service.phase, 'cooking');
assert.equal(service.cookTime, 0);
assert.ok(service.heat > firstHeat, 'the next batch burns hotter');
assert.ok(batch(service).high - batch(service).low < firstWidth, 'target zone narrows');
const warning = cooking();
warning.elapsed = 12;
warning.batchTime = C.surgeEvery - C.surgeWarningSeconds + 0.01;
step(warning, C.step, false);
assert.equal(warning.surgeWarning, true, 'the surge is announced before it starts');
assert.equal(warning.surge, 0);
warning.batchTime = C.surgeEvery + 0.3;
step(warning, C.step, false);
assert.equal(warning.surgeWarning, false);
assert.ok(warning.surge > 0, 'the warned surge changes actual pressure acceleration');
while (service.phase !== 'victory') {
  const width = batch(service).high - batch(service).low;
  const heat = service.heat;
  finishBatch(service);
  if (service.phase !== 'victory') {
    advance(service, C.batchPause + C.step);
    assert.ok(batch(service).high - batch(service).low < width);
    assert.ok(service.heat > heat);
  }
}
assert.equal(service.dishes, C.batches.length);
assert.equal(service.best, Math.floor(service.score));
const finalScore = service.score;
advance(service, 2);
assert.equal(service.score, finalScore, 'victory freezes scoring');
const fresh = create(service.best);
assert.equal(fresh.dishes, 0);
assert.equal(fresh.batchIndex, 0);
assert.equal(fresh.cookTime, 0);
assert.equal(fresh.surgeWarning, false);
assert.equal(batch(fresh).low, C.zoneLow);
assert.equal(batch(fresh).high, C.zoneHigh);
assert.equal(fresh.best, Math.floor(finalScore));

// Policies use sampled observations, not privileged control of pressure or heat.
function runPolicy(interval, policy) {
  const state = cooking();
  let nextDecision = 0;
  let held = false;
  let minimumPressure = state.pressure;
  while ((state.phase === 'cooking' || state.phase === 'batch') && state.elapsed < 240) {
    if (state.elapsed >= nextDecision) {
      held = policy(state, held);
      nextDecision += interval;
    }
    step(state, C.step, held);
    minimumPressure = Math.min(minimumPressure, state.pressure);
  }
  return { ...state, minimumPressure };
}
assert.ok(C.batches[0].seconds >= 6 && C.batches[0].seconds <= 7);
assert.ok(C.batches[1].seconds >= 6 && C.batches[1].seconds <= 7);
let randomSeed = 0x1234;
const randomTap = () => {
  randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
  return randomSeed / 4294967296 < 0.4;
};
const random = runPolicy(0.15, randomTap);
assert.equal(random.phase, 'gameover', 'random taps cannot win the service');
assert.ok(random.dishes < C.batches.length);
const idle = runPolicy(1, () => false);
const tapping = runPolicy(C.step, s => s.elapsed % 0.4 < 0.15);
const reasonable = runPolicy(0.45, (s, held) => {
  const target = batch(s);
  const predicted = s.pressure + s.velocity * 0.25;
  return predicted > target.high - 1 ? true : predicted < target.low + 1 ? false : held;
});
const expert = runPolicy(0.08, s => s.pressure + s.velocity * 0.5 > (batch(s).low + batch(s).high) / 2);
assert.ok(idle.elapsed >= 8 && idle.elapsed <= 10, 'opening ignition gives 8–10 seconds before idle blowout');
assert.ok(tapping.minimumPressure > 40, '150 ms taps every 400 ms never drain the boiler');
assert.ok(tapping.elapsed > idle.elapsed * 2, 'repeated taps extend the initial run');
assert.ok(reasonable.elapsed > idle.elapsed * 4, 'ordinary reactions substantially outperform idle play');
assert.ok(reasonable.score > idle.score * 3);
assert.equal(reasonable.phase, 'victory', 'an ordinary player can finish the service');
assert.ok(reasonable.elapsed >= 60 && reasonable.elapsed <= 120, 'ordinary win takes a realistic 60–120 seconds');
assert.equal(expert.phase, 'victory', 'expert anticipation can win');
assert.equal(expert.dishes, C.batches.length);
assert.ok(expert.elapsed >= 55 && expert.elapsed <= 65, 'expert service lasts approximately one minute');
assert.ok(expert.score > reasonable.score, 'anticipation rewards zone control');
assert.equal(idle.phase, 'gameover');
assert.equal(tapping.phase, 'gameover', 'unthinking repetitive taps do not win');
assert.ok(tapping.dishes < C.batches.length);
const held = runPolicy(1, () => true);
assert.equal(held.phase, 'gameover', 'rising heat prevents endless full-vent runs');
console.log('Physics checks passed: rise, venting, inertia, clamps, scoring, combo, batches, narrowing, '
  + 'heat, surge warning, victory, blowout, reset.');
const policies = [
  ['idle', idle], ['tapping', tapping], ['random', random], ['reasonable', reasonable], ['expert', expert]
];
for (const [name, state] of policies) {
  const result = `${name}: ${state.elapsed.toFixed(1)}s, ${Math.floor(state.score)} points, ${state.phase}`;
  console.log(result + `, ${state.dishes}/${C.batches.length} dishes, heat ${state.heat.toFixed(1)}`);
}
