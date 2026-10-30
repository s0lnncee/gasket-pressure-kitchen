/* Deterministic simulation. Rendering, input and wall-clock time live elsewhere. */
(function (root) {
  'use strict';
  const STEP = 1 / 120;
  const RULES = Object.freeze({ low: 65, high: 85, maximum: 100, pointsPerSecond: 10, ventRate: 15 });
  const ORDERS = Object.freeze([
    Object.freeze({ name: 'Midnight broth', subtitle: 'A little warmth for the night crew.', target: 15, heat: 5.4, intensity: 'GENTLE', symbol: '01' }),
    Object.freeze({ name: 'Foundry dumplings', subtitle: 'The furnace crew is getting hungry.', target: 18, heat: 6.6, intensity: 'HOT', symbol: '02' }),
    Object.freeze({ name: 'The last supper', subtitle: 'One final order. Make it count.', target: 20, heat: 7.8, intensity: 'FULL FIRE', symbol: '03' })
  ]);
  class Kitchen {
    constructor() { this.reset(); }
    reset() {
      this.pressure = 55;
      this.zoneTime = 0;
      this.elapsed = 0;
      this.stage = 0;
      this.progress = 0;
      this.stageElapsed = 0;
      this.completed = 0;
      this.serviceBonus = 0;
      this.lastBonus = 0;
      this.overtime = false;
      this.overtimeElapsed = 0;
      this.state = 'ready';
      this.venting = false;
      this.remainder = 0;
    }
    get order() { return ORDERS[this.stage]; }
    get inZone() { return this.pressure >= RULES.low && this.pressure <= RULES.high; }
    get heatRate() { return this.overtime ? 7.8 + Math.min(this.overtimeElapsed / 120, 1) : this.order.heat; }
    get score() { return Math.floor(this.zoneTime * RULES.pointsPerSecond + 1e-8) + this.serviceBonus; }
    get efficiency() { return this.elapsed > 0 ? Math.min(100, Math.round(100 * this.zoneTime / this.elapsed)) : 0; }
    start() { if (this.state === 'ready') this.state = 'cooking'; }
    setVenting(value) { this.venting = this.state === 'cooking' && Boolean(value); }
    stop(state) { this.state = state; this.venting = false; this.remainder = 0; }
    pause() { if (this.state === 'cooking') this.stop('paused'); }
    resume() { if (this.state === 'paused') this.state = 'cooking'; }
    nextOrder() {
      if (this.state !== 'served' || this.stage >= ORDERS.length - 1) return;
      this.stage++;
      this.pressure = 55;
      this.progress = 0;
      this.stageElapsed = 0;
      this.stop('cooking');
    }
    continueOvertime() {
      if (this.state !== 'victory') return;
      this.overtime = true;
      this.overtimeElapsed = 0;
      this.pressure = 65;
      this.stop('cooking');
    }
    advance(seconds) {
      if (this.state !== 'cooking' || !Number.isFinite(seconds) || seconds <= 0) return;
      // A stalled frame never simulates an unattended interval longer than 100 ms.
      this.remainder += Math.min(seconds, .1);
      while (this.remainder + 1e-12 >= STEP && this.state === 'cooking') {
        this.remainder -= STEP;
        const rate = this.heatRate - (this.venting ? RULES.ventRate : 0);
        const previous = this.pressure;
        const next = Math.max(0, Math.min(RULES.maximum, previous + rate * STEP));
        // Integrate the fraction of the step inside the zone, including crossings.
        const distance = Math.abs(next - previous);
        const overlap = Math.max(0, Math.min(Math.max(previous, next), RULES.high) - Math.max(Math.min(previous, next), RULES.low));
        const zoneStep = distance > 0 ? STEP * overlap / distance : (this.inZone ? STEP : 0);
        const earned = this.overtime ? zoneStep : Math.min(zoneStep, this.order.target - this.progress);
        this.zoneTime += earned;
        if (!this.overtime) this.progress = Math.min(this.order.target, this.progress + earned);
        this.pressure = next;
        this.elapsed += STEP;
        this.stageElapsed += STEP;
        if (this.overtime) this.overtimeElapsed += STEP;
        // The safety limit always takes precedence over serving an order.
        if (next >= RULES.maximum) this.stop('over');
        else if (!this.overtime && this.progress >= this.order.target - 1e-9) {
          this.progress = this.order.target;
          this.lastBonus = Math.min(100, Math.floor(100 * this.order.target / this.stageElapsed));
          this.serviceBonus += this.lastBonus;
          this.completed++;
          this.stop(this.stage === ORDERS.length - 1 ? 'victory' : 'served');
        }
      }
    }
  }
  root.PressureKitchen = Object.freeze({ Kitchen, RULES, ORDERS });
})(typeof window !== 'undefined' ? window : globalThis);
