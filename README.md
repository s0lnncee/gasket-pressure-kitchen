# Gasket's Pressure Kitchen

A Canvas pressure-control arcade game starring Gasket, a robot rat chef. Keep the needle in the orange **65–85 PSI** band to score. Three uninterrupted seconds raise the multiplier, up to ×5; leaving the band resets it. At **100 PSI**, the valve blows.

Open `index.html` directly in a modern browser, including via `file://`. There are no dependencies, external assets, build steps, or network requests. The classic script `src/sim.js` contains the shared physics; `index.html` contains input, effects and drawing.

- **Space / Enter:** start a batch.
- **Hold Space or click/touch and hold the lever:** vent steam and lower pressure.
- **Release:** build pressure. Tap for a small pressure correction; hold for full cooling. Vent before reaching the top of the orange band: both lever travel and pressure have inertia.
- **Play again / Space / Enter:** restart after the blowout animation.

A ten-second ignition ramp gives an idle newcomer about eight seconds before blowout. Heat then rises gradually, with predictable seven-second surges. Its quadratic ramp eventually exceeds the valve's cooling capacity, so runs end even with precise control. Continuous zone control rewards anticipation rather than simply staying alive. The first-action hint fades, while zone entry, exit and combo changes have text and gauge feedback. A burst and flash precede the final-score overlay.

Best score is saved locally when storage is available. Keyboard and captured pointer inputs work independently; losing focus releases both. Desktop and portrait layouts use the same simulation. Reduced-motion preferences lower flashes and disable shake.

Run the dependency-free physics and balance tests:

```sh
node test/physics.test.mjs
```

The tests cover pressure rise, venting, lever and pressure inertia, bounds, zone scoring, combo, blowout and reset. They also simulate an idle player, a player tapping for 150 ms every 400 ms, a threshold player reacting every 450 ms, and a predictive expert reacting every 80 ms. Expected runs are roughly 8, 25, 105 and 132 seconds respectively; the expert earns more from sustained combos. These are deterministic policy benchmarks, not measured human play.

Run the round check:

```sh
node .launchpad/checks/round-1/run.mjs
```
