# Gasket's Pressure Kitchen

A single-file Canvas game about controlling an industrial cooking pod with Gasket, a robot rat chef.
Open `index.html` directly, including via `file://`, or serve the directory with `npx serve .`.
No dependencies, external assets, network requests or build step are needed.

Cook a five-dish service. The first two batches need **6.5 cumulative seconds** in their orange target bands;
the three finishing batches need **12 seconds** each. The quick opening introduces the controls before the
more demanding finishing dishes. Bands narrow from **65–85 → 68–82 → 70–80 → 71–79 → 72–78 PSI**.
Every new batch has a hotter burner and stronger surges. The gauge and progress caption show the current
band and required cook time. Leaving the band pauses cooking progress and resets the combo; continuous
control raises the multiplier to ×5. Each cooked dish adds 500 points.

A cooked batch gets a celebration and a 1.2-second loading pause. The next starts at the centre of its new
band with zero pressure velocity. Five dishes trigger **SERVICE COMPLETE**: an amber celebration, five
served dishes lighting in sequence, and Gasket raising both arms. At **100 PSI**, the valve blows and the
current batch is lost; Game Over uses a separate, darker presentation. Both results show dishes, final
service score, best score and Play again. Score and cooking freeze at the result. The best score is saved
locally when storage is available. The portrait victory layout stacks its message, celebrating Gasket and a
compact, single-line replay button. Neither result draws a duplicate touch retry instruction behind that button.

- **Keyboard:** hold Space to start and vent; Enter starts without venting. Release to heat. M toggles sound.
- **Mouse:** click and hold anywhere on the canvas to start and vent; release to heat.
- **Touch:** hold or tap anywhere on the canvas to start and vent; release to heat.
- **Tap:** trim pressure gently. **Hold:** vent hard. Lever and pressure inertia reward anticipation.
- **Replay:** click/tap Play again, or use Space/Enter on a keyboard after the result animation.
  The restart press does not vent; release and press again to vent.
- **Mute:** click/tap the sound button or press M. Space/Enter never toggle mute, even when it has focus.
  Pointer clicks and assistive activations both work. Clicking Mute returns focus to the game.
  The preference is saved when storage is available.

Control labels follow the last keyboard, mouse or touch input. The initial choice follows pointer capability.
Pointer capability sets only the initial mode. A tablet switches to keyboard or mouse wording after that input.
When touch is the last input, start, hints, sound controls and result screens omit keyboard shortcuts.
The first-vent hint stays after an Enter-only start, occupies a separate wall plaque, and hides at either result.
Combo and batch feedback have a reserved line inside the dial, with smaller mobile text clear of the ticks.
The hint clears the wall piping and the pod handle; the caution sign sits below the progress caption.
Cook timers use one decimal on both sides, such as 6.5/6.5s and 12.0/12.0s.
Space release always clears the held input, even if focus moves to a button. Window blur and hiding the
page release all keyboard and pointer inputs.

The ignition gives an idle newcomer about **8.6 seconds** before blowout. Surges begin seven cooking
seconds into each batch and recur every seven seconds, with a **SURGE INCOMING** warning 1.4 seconds ahead.
The burner readout gives its level out of five. Desktop and mobile share the same simulation. Heat keeps
rising if cooking stalls, so holding the valve indefinitely also ends in blowout.

Quiet synthesized hiss, alarms, chimes, a blowout thump and a victory jingle unlock only after user interaction.
Blocked audio fails silently. Reduced-motion preferences disable shaking and bouncing, reduce flashes and
burst motion, and light all victory dishes immediately.

The pure simulation is the `<script id="sim">` block in `index.html`; named sections handle drawing, input
and optional audio. Run the dependency-free checks:

```sh
node test/physics.test.mjs
node test/ui.test.mjs
node .launchpad/checks/round-1/run.mjs
```

Physics tests cover pressure, tap/hold cooling, inertia, clamps, scoring, combo, batch cooking, increasing heat,
narrowing bands, surge warnings, victory, blowout and reset. They assert the opening batches' cook times and
an expert completion within 55–65 seconds. Deterministic policy results:

| Policy | Result |
| --- | --- |
| Idle | Blowout at 8.6s; no dishes |
| 150 ms taps every 400 ms | Blowout at 26.8s; no dishes |
| Seeded random tapping | Blowout at 59.4s; no dishes |
| 450 ms decisions with 250 ms pressure anticipation | Five dishes in 91.2s |
| 80 ms predictive expert | Five dishes in 56.4s |

These are scripted benchmarks, not human play measurements. UI smoke tests run both inline scripts with
mocked Canvas, DOM and audio. They exercise keyboard and touch services, mute focus, button-focused Space
release, blur/visibility release, actual-input overrides on tablets, assistive mute activation, counter formatting,
hint timing, sequential victory lights and replay. Layout checks cover 390×844 and 360×740 mobile results,
button/chef separation, hint/pipe clearance and popup density, plus both desktop sizes.
They also enforce the 120-character source-line limit. Real browser pixels and audible quality need separate
review; mocks cannot verify them.
