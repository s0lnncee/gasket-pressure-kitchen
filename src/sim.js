/* Pure fixed-step simulation. A classic script keeps file:// play dependency-free. */
globalThis.KitchenPhysics = (() => {
  'use strict';

  const SETTINGS = Object.freeze({
    maxPSI: 100,
    zoneLow: 65,
    zoneHigh: 85,
    warningPSI: 90,
    initialPSI: 58,
    heatBase: 7.5,
    heatRamp: 0.09,
    heatAcceleration: 0.0012,
    ventForce: 37,
    ventCurve: 2,
    warmupSeconds: 10,
    warmupHeat: 2.5,
    pressureResponse: 3.5,
    spring: 180,
    damping: 25,
    surgeEvery: 7,
    surgeDuration: 2,
    surgeForce: 2,
    pointsPerSecond: 100,
    comboSeconds: 3,
    comboMax: 5,
    step: 1 / 120
  });

  function create(best = 0) {
    return {
      phase: 'ready',
      pressure: SETTINGS.initialPSI,
      velocity: 0,
      heat: SETTINGS.heatBase,
      elapsed: 0,
      score: 0,
      best,
      combo: 1,
      zoneTime: 0,
      inZone: false,
      lever: 0,
      leverVelocity: 0,
      surge: 0
    };
  }

  function score(state, dt) {
    state.inZone = state.pressure >= SETTINGS.zoneLow && state.pressure <= SETTINGS.zoneHigh;
    state.zoneTime = state.inZone ? state.zoneTime + dt : 0;
    state.combo = Math.min(SETTINGS.comboMax, 1 + Math.floor(state.zoneTime / SETTINGS.comboSeconds));
    if (state.inZone) {
      state.score += SETTINGS.pointsPerSecond * state.combo * dt;
    }
  }

  function step(state, dt, venting) {
    if (!(dt > 0) || dt > 0.1) {
      throw new Error('Simulation step must be greater than zero and at most 0.1 seconds.');
    }
    const target = state.phase === 'cooking' && venting ? 1 : 0;
    state.leverVelocity += ((target - state.lever) * SETTINGS.spring - state.leverVelocity * SETTINGS.damping) * dt;
    state.lever = Math.max(0, Math.min(1, state.lever + state.leverVelocity * dt));
    if (state.lever === 0 || state.lever === 1) {
      state.leverVelocity = 0;
    }
    if (state.phase !== 'cooking') {
      return;
    }

    state.elapsed += dt;
    // The quadratic ramp eventually overtakes the valve: no immortal steady state.
    state.heat = SETTINGS.heatBase + state.elapsed * SETTINGS.heatRamp + state.elapsed ** 2 * SETTINGS.heatAcceleration;
    // A slow ignition gives a newcomer time to read before full heat arrives.
    const ignition = Math.min(1, state.elapsed / SETTINGS.warmupSeconds);
    state.heat *= SETTINGS.warmupHeat / SETTINGS.heatBase + (1 - SETTINGS.warmupHeat / SETTINGS.heatBase) * ignition;
    const surgePhase = state.elapsed % SETTINGS.surgeEvery;
    state.surge = surgePhase < SETTINGS.surgeDuration
      ? Math.sin(surgePhase / SETTINGS.surgeDuration * Math.PI) * (SETTINGS.surgeForce + state.elapsed * 0.025)
      : 0;
    // Progressive valve opening: short pulls trim pressure; a full pull vents hard.
    const cooling = state.lever ** SETTINGS.ventCurve * SETTINGS.ventForce;
    const targetVelocity = state.heat + state.surge - cooling;
    state.velocity += (targetVelocity - state.velocity) * SETTINGS.pressureResponse * dt;
    state.pressure = Math.max(0, Math.min(SETTINGS.maxPSI, state.pressure + state.velocity * dt));
    if (state.pressure === 0) {
      state.velocity = Math.max(0, state.velocity);
    }
    score(state, dt);
    if (state.pressure === SETTINGS.maxPSI) {
      state.phase = 'gameover';
      state.best = Math.max(state.best, Math.floor(state.score));
    }
  }

  return Object.freeze({ SETTINGS, create, step, score });
})();
