# Gasket's Pressure Kitchen

A self-contained HTML5 Canvas pressure-control arcade game. Help Gasket, a robot rat chef, keep the industrial cooking pod in its orange 65–85 PSI zone. Hold the zone to earn points and build a combo up to ×5. Heat increases over time, with gentle surges; 100 PSI blows the valve.

Open `index.html` directly in a modern browser. No dependencies, assets, build step, or network access are needed. Alternatively, serve this directory with `npx serve .`.

- **Space / Enter:** start a batch.
- **Hold Space or click/touch and hold the lever:** vent steam and lower pressure.
- **Release:** build pressure. The lever and pressure have inertia, so vent early.
- **Play again / Space / Enter:** restart after a blowout.

Best score is stored locally when browser storage is available. The game resizes for desktop and portrait screens, supports pointer capture and keyboard controls, and reduces shaking and flash intensity when reduced motion is preferred.

Run the round check with `node .launchpad/checks/round-1/run.mjs`.
