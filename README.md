# Gasket's Pressure Kitchen

The pod is cooking and its pressure keeps climbing. Gasket works the vent lever: keep the needle in the
orange zone (65–85 PSI) to score, and don't let it reach 100 PSI, or the valve blows.

## Play

Open `index.html` in a browser, or serve the folder (`npx serve .`). One file, no build step, no assets.

- Hold `Space`, or press and hold the lever (anywhere on the play area), to vent steam.
- Each second in the zone scores 10 points × the multiplier. The multiplier goes up by one every 4
  seconds you stay in the zone, up to ×5, and drops back to ×1 as soon as you leave it.
- The heat rises the longer you cook, and boil surges ("SURGE INCOMING") push the pressure up suddenly.
- At 100 PSI: Game Over, with your score, your best (kept in this browser) and a `Play again` button.

## How it works

- The simulation runs at a fixed 120 Hz step, so the physics stays the same at any frame rate.
  Heat input grows with time and pressure. Venting flows like an orifice (∝ √pressure), and the lever
  travels with a spring instead of snapping, so it opens and closes smoothly.
- The needle follows the pressure with a critically damped spring, and the digital readout shows the
  exact value.
- The layout is landscape on wide screens and portrait on phones. The palette is the Hotpod control
  room: `#0D0908`, `#F3EEE9`, `#F05A18`, `#FFB35C`, plus a red for the danger band, with no blue or
  purple.
