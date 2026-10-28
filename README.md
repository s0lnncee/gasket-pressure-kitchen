# Gasket’s Last Shift

A self-contained Canvas pressure kitchen. Three orders before sunrise. Hold to
vent, release to heat, and feed the night crew without blowing the valve.

## Play

Open **`index.html`** directly in a modern browser. Alternatively serve the root
with `npx serve .`. No build, downloaded assets, or runtime dependencies are
needed. The game makes no network requests.

Press **Start shift** when ready. Hold **Space**, the mouse button, or your finger
on the orange **steam-release lever** to lower pressure. Release to raise it.
The focused lever also accepts **Enter**. Keep the needle in the orange
**65–85 PSI** band. At **100 PSI**, the valve blows and Game Over shows your score.
**Play again** starts a fresh three-order shift.

| Order | Time in the sweet spot | Heat |
| --- | --- | --- |
| Midnight broth | 15 seconds | 5.4 PSI/second |
| Foundry dumplings | 18 seconds | 6.6 PSI/second |
| The last supper | 20 seconds | 7.8 PSI/second |

Cooking progress accumulates only in the sweet spot. Outside it, progress waits;
it never resets. Venting removes 15 PSI/second before heat is added. Each order
has constant, announced heat: no random pressure spikes or hidden modifiers.

Serving an order turns the burner off and freezes pressure, time, and score.
Choose **Cook next order** when ready; a fresh load starts at 55 PSI. After all
three orders, the victory screen shows the final score. You can replay, or
choose **Continue into overtime**: start at 65 PSI, retain your score, and survive
as long as possible. Overtime heat rises gradually from 7.8 to 8.8 PSI/second over
two minutes, then stays capped. The valve can always vent faster than the burner
heats. A later overtime blowout does not undo the completed three-order victory.

### Score and feedback

Earn **10 points per second in the zone**. Each served dish adds a service bonus:
`floor(100 × required zone time / active time spent on that order)`, capped at 100.
A more efficient shift earns a higher score. Pauses and handoffs do not count
against efficiency. The best score is saved locally when browser storage is
available; storage failure never blocks play.

The pressure number, analog gauge and meter show the same pressure. The gauge's
orange arc marks the sweet spot. The burner, steam, pressure trend, status text,
and Gasket's expression respond to the simulation. At 93 PSI, the critical
warning strengthens. Sound is optional and off initially; enabling it uses
locally synthesized tones, with no audio files or network access.

### Pause and access

- **P**, **Escape**, or the Pause button freezes the active shift. P or Resume
  resumes. Switching tabs or losing window focus also pauses automatically.
- Focus loss, touch cancellation and captured-pointer release clear held input.
- Keyboard focus stays within an open game dialog. Native buttons, a semantic
  pressure meter, a cooking progress bar, and status text complement the Canvas.
- The objective, pressure, and lever fit the initial phone viewport. Touch targets
  remain large. Landscape has a compact arrangement.
- Reduced-motion preferences disable confetti, shake, moving steam, blinking,
  flame flicker and CSS animations. Pressure feedback remains live.

## Source structure

- `engine.js`: pure deterministic 120 Hz simulation and guarded state transitions.
- `renderer.js`: procedural Canvas vessel, face, dishes and visual effects.
- `game.js`: input lifecycle, DOM feedback, optional audio and animation clock.
- `style.css`: responsive console, controls, dialogs and transitions.

Simulation time steps are capped at 100 ms after a stalled frame. Fractional
steps crossing a zone boundary credit only their actual time inside it. The
blowout limit takes precedence over completion. Rendering and audio never change
the physics. Paused and terminal states reject gameplay input.

## Regression tests

**Simulation:** run `npm test` with Node 20 or newer. It requires no installation.
Tests cover the three exact order targets, proportional zone scoring, retained
progress, frame-rate independence, handoffs, victory, overtime, heat limits,
100 PSI failure, pause/reset and invalid navigation.

**Browser:** supply `playwright-core@1.63.0` and its matching Chromium separately
from the app. Run:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright-core node --test tests/browser.cjs
```

The browser suite opens the actual `index.html`, uses keyboard, mouse and touch
input, and advances the browser clock without changing the simulation. It covers
start, the complete campaign, frozen transitions, victory/overtime, failure and
restart, focus/visibility loss, canceled touch, overlapping inputs, modal keyboard
navigation, optional audio, unavailable storage, reduced motion, runtime errors,
and no-scroll layouts at 320×568, 390×844, 768×1024 and 844×390. Set
`SCREENSHOT_DIR` to an existing output directory to capture the tested states.

Both suites can run in the official Playwright image with the source mounted
read-only and networking disabled. Browser tooling is for verification only and
is not required to play.
