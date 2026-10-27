# Gasket's Pressure Kitchen

A single-file Canvas arcade game about controlling an industrial cooking pod with Gasket, a robot rat chef. Open `index.html` directly, including via `file://`, or serve the directory with `npx serve .`. The game has no dependencies, external assets, network requests or build step.

Cook a five-dish service. Each batch needs **8 cumulative seconds inside its orange target band**. The bands narrow from **65–85 → 68–82 → 70–80 → 71–79 → 72–78 PSI**, and each new batch has a hotter burner and stronger surges. The gauge and progress caption always show the current band. Leaving it pauses cooking progress and resets the combo; continuous control raises the multiplier to ×5. Each cooked dish adds 500 bonus points.

A cooked batch gets a warm celebration and a 1.2-second loading pause. The next batch starts at the centre of its new band with zero pressure velocity. Five dishes trigger **SERVICE COMPLETE**. At **100 PSI**, the valve blows and the current batch is lost. Both outcomes show dishes, final service score, best score and **Play again**. Score and cooking stop at the result; the best service score is saved locally when storage is available.

- **Hold Space, click or touch anywhere on the canvas:** start and vent. Buttons have their own actions.
- **Enter:** start without venting. The hint stays until the first vent.
- **Tap:** trim pressure gently. **Hold:** vent hard. **Release:** build pressure. The lever and pressure have inertia, so anticipate the top of the band.
- **Play again / Space / Enter after the result animation:** start a new service. The Space press that restarts does not also vent; release and press again to vent.
- **Sound button / M:** toggle mute. The preference is saved when storage is available.

The opening ignition gives an idle newcomer about 8.6 seconds before blowout. Surges begin seven cooking seconds into each batch and recur every seven seconds, with a visible **SURGE INCOMING** warning 1.4 seconds beforehand. Burner level, elapsed time, batch progress, dish count and service score describe the same simulation on desktop and mobile. Heat keeps rising if cooking stalls, so holding the valve indefinitely also ends in blowout.

Quiet synthesized vent hiss, alarm beeps, combo/batch chimes, a blowout thump and a victory jingle are unlocked only by a user interaction. Unsupported or blocked audio fails silently. Losing focus releases input. Reduced-motion preferences disable shake and reduce flashes and burst motion.

The pure fixed-step simulation is the `<script id="sim">` block in `index.html`; drawing, input and optional audio follow it in named sections. Run the dependency-free checks:

```sh
node test/physics.test.mjs
node test/ui.test.mjs
node .launchpad/checks/round-1/run.mjs
```

Physics tests cover pressure rise, tap/hold cooling, inertia, clamps, scoring, combos, cumulative cooking, dish increments, hotter batches, narrower bands, surge warnings, victory, blowout and reset. Measured deterministic policies: idle blows out at **8.6s**, 150 ms taps every 400 ms blow out at **26.8s** without cooking a dish, a threshold player reacting every 450 ms completes five dishes in **110.4s**, and a predictive player reacting every 80 ms completes them in **47.3s**. These are scripted benchmarks, not human play measurements.

The UI smoke tests evaluate both inline scripts with mocked Canvas, DOM and audio interfaces. They exercise desktop keyboard and mobile pointer service completion, replay, mute persistence, hint timing, warning priority and unavailable audio/storage. Real browser rendering and sound should be reviewed separately; the mocks do not verify pixels or audible quality.
