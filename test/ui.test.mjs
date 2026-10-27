import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Dependency-free control-flow smoke tests; these do not replace browser pixel review.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?: id="sim")?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scripts.length, 2);
assert.ok(!/<script[^>]+src=|<img|https?:\/\//i.test(html), 'the game has no external assets');

function setup(width, height, blocked = false) {
  const text = [];
  const labels = [];
  const stored = new Map();
  const handlers = new Map();
  let audioContexts = 0;
  let activeElement = null;
  const noop = () => {};
  class Button {
    hidden = true;
    style = {};
    attributes = {};
    handlers = new Map();
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { this.handlers.set(name, handler); }
    focus() { activeElement = this; }
  }
  const graphics = new Proxy({
    fillText(value, x, y) {
      text.push(value);
      labels.push({ value, x, y, font: this.font });
    }
  }, {
    get: (object, key) => object[key] ?? (key.startsWith('create') ? () => ({ addColorStop: noop }) : noop)
  });
  const canvas = {
    style: {},
    getContext: () => graphics,
    addEventListener: (name, handler) => handlers.set(name, handler),
    setPointerCapture: noop,
    focus() { activeElement = canvas; },
    setAttribute: noop
  };
  const replay = new Button();
  const mute = new Button();
  const elements = { kitchen: canvas, replay, mute, announcement: {}, instructions: {} };
  const document = {
    getElementById: id => elements[id],
    addEventListener: (name, handler) => handlers.set('document:' + name, handler),
    get activeElement() { return activeElement; },
    hidden: false
  };
  const param = () => ({
    value: 0,
    setValueAtTime: noop,
    linearRampToValueAtTime: noop,
    exponentialRampToValueAtTime: noop,
    setTargetAtTime: noop
  });
  class Audio {
    constructor() {
      audioContexts++;
      if (blocked) throw new Error('Audio unavailable');
    }
    sampleRate = 8000;
    currentTime = 0;
    state = 'running';
    destination = {};
    createGain() { return { gain: param(), connect: noop }; }
    createBiquadFilter() { return { frequency: param(), connect: noop }; }
    createBuffer() { return { getChannelData: () => new Float32Array(8000) }; }
    createBufferSource() { return { connect: noop, start: noop }; }
    createOscillator() { return { frequency: param(), connect: noop, start: noop, stop: noop }; }
  }
  const context = {
    HTMLButtonElement: Button,
    document,
    window: { innerWidth: width, innerHeight: height, devicePixelRatio: 1, AudioContext: Audio,
      addEventListener: (name, handler) => handlers.set('window:' + name, handler) },
    localStorage: {
      getItem: key => {
        if (blocked) throw new Error('Storage unavailable');
        return stored.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (blocked) throw new Error('Storage unavailable');
        stored.set(key, value);
      }
    },
    matchMedia: query => ({
      matches: query === '(pointer: coarse)' && width < height,
      addEventListener: noop
    }),
    requestAnimationFrame: noop
  };
  vm.createContext(context);
  for (const script of scripts) vm.runInContext(script, context);
  const run = code => vm.runInContext(code, context);
  const tick = seconds => run(`for(let i=0;i<Math.ceil(${seconds}/CONFIG.step);i++) update(CONFIG.step); render();`);
  return {
    run, tick, canvas, mute, replay, stored, text, labels, handlers, document,
    audioContexts: () => audioContexts
  };
}

for (const [width, height] of [[1440, 900], [390, 844], [360, 740]]) {
  const ui = setup(width, height);
  const { run, tick, text, replay, mute } = ui;
  run('render()');
  assert.ok(text.includes(width < height ? 'HOLD OR TAP ANYWHERE TO VENT' : 'HOLD SPACE TO VENT'));
  assert.ok(text.includes('1/5'), 'burner readout includes its scale');
  if (width < height) {
    assert.ok(!text.some(label => /SPACE|ENTER/.test(label)), 'touch wording has no keyboard instructions');
    assert.ok(!mute.textContent.includes('· M'));
  }
  assert.ok(text.includes('DISHES 0/5'));
  assert.ok(text.includes('BATCH 1/5'));
  assert.equal(ui.audioContexts(), 0, 'no audio context before a user gesture');
  run("keydown({code:'Enter',repeat:false,preventDefault(){}})");
  tick(0.5);
  assert.equal(run('state.hintOpacity'), 1, 'Enter must not fade the vent hint');
  assert.equal(ui.audioContexts(), 1);
  run("keydown({code:'KeyM',repeat:false,preventDefault(){}})");
  assert.equal(mute.attributes['aria-pressed'], 'true');
  assert.equal(ui.stored.get('gasket-muted-v1'), 'true');
  mute.focus();
  mute.handlers.get('click')({detail:1});
  assert.equal(ui.document.activeElement, ui.canvas, 'Mute returns focus to the game');
  assert.equal(mute.attributes['aria-pressed'], 'false');

  // Same measured threshold player through keyboard on desktop and touch on mobile.
  run(`
    let nextDecision = state.elapsed;
    let holding = false;
    while ((state.phase === 'cooking' || state.phase === 'batch') && state.elapsed < 180) {
      if (state.elapsed >= nextDecision) {
        const target = KitchenPhysics.batch(state);
        const predicted = state.pressure + state.velocity * 0.25;
        const next = predicted > target.high - 1 ? true : predicted < target.low + 1 ? false : holding;
        if (next !== holding) {
          if (${width} > ${height}) {
            if (next) keydown({code:'Space',repeat:false,preventDefault(){}});
            else keyup({code:'Space',preventDefault(){}});
          } else {
            if (next) pointerdown({button:0,pointerId:7,pointerType:'touch',clientX:5,clientY:5,preventDefault(){}});
            else releasePointer({pointerId:7});
          }
          holding = next;
        }
        nextDecision += 0.45;
      }
      update(CONFIG.step);
    }
    releaseAll();
    render();
  `);
  assert.equal(run('state.phase'), 'victory');
  assert.equal(run('state.dishes'), 5);
  assert.equal(run('state.hintOpacity'), 0);
  const winTime = run('state.elapsed');
  const best = run('state.best');
  tick(1);
  assert.equal(replay.hidden, false);
  assert.ok(text.includes('SERVICE COMPLETE'));
  if (width < height) {
    text.length = 0;
    run('render()');
    assert.ok(!text.some(label => /SPACE|ENTER/.test(label)));
    assert.equal(replay.textContent, 'Tap to play again');
  }
  run(`
    const servedDish = drawServedDish;
    let litDishes = [];
    drawServedDish = (x, y, lit) => { litDishes.push(lit); servedDish(x, y, lit); };
    state.resultTime = CONFIG.overlayDelay + 0.01;
    render();
  `);
  assert.equal(run('litDishes.filter(Boolean).length'), 1, 'victory lights its first dish');
  run('litDishes=[]; state.resultTime+=CONFIG.layout.victory.lightDelay*4; render();');
  assert.equal(run('litDishes.filter(Boolean).length'), 5, 'all five dishes light in sequence');
  assert.equal(Number(ui.stored.get('gasket-best-v1')), best);
  run("keydown({code:'Space',repeat:false,preventDefault(){}})");
  tick(0.05);
  assert.equal(run('state.phase'), 'cooking');
  assert.equal(run('input.space'), false, 'Space restarts without venting');
  assert.equal(run('state.lever'), 0);
  assert.equal(run('state.acted'), false);
  assert.equal(run('state.best'), best);
  run("keyup({code:'Space',preventDefault(){}})");

  // A touch far from the lever still vents, then cancellation releases it.
  run("pointerdown({button:0,pointerId:3,pointerType:'touch',clientX:2,clientY:2,preventDefault(){}})");
  tick(0.4);
  assert.ok(run('state.lever') > 0.9);
  ui.handlers.get('pointercancel')({ pointerId: 3 });
  assert.equal(run('isVenting()'), false);
  tick(1);
  run('resetState(); startCooking();');
  while (run("state.phase === 'cooking'")) tick(0.1);
  assert.equal(run('state.phase'), 'gameover');
  const lossTime = run('state.elapsed');
  assert.equal(replay.hidden, true);
  tick(1);
  assert.ok(text.includes('GAME OVER'));
  text.length = 0;
  run('state.hintOpacity=1; render();');
  assert.ok(!text.some(label => /RELEASE TO HEAT|HOLD SPACE|HOLD CLICK|HOLD \/ TAP/.test(label)),
    'control hints are hidden behind the result');
  assert.ok(text.some(label => label.includes('VALVE BLOWN')) || width < height);
  run("keydown({code:'Space',repeat:false,preventDefault(){}})");
  assert.equal(run('input.space'), false, 'loss restart also leaves vent released');

  run('state.batchTime=6; state.pressure=91; state.velocity=0; update(CONFIG.step); render();');
  assert.ok(text.includes('CRITICAL · VENT NOW · SURGE INCOMING'), 'critical pressure cannot hide the surge warning');
  // Mute cannot capture gameplay keys, and releasing Space cannot depend on focus.
  run('resetState();');
  const initialMute = mute.attributes['aria-pressed'];
  const initialMode = run('inputType');
  mute.handlers.get('click')({detail:0});
  assert.notEqual(mute.attributes['aria-pressed'], initialMute, 'assistive click toggles Mute');
  assert.equal(run('inputType'), initialMode, 'semantic click preserves the last control mode');
  const beforeMute = mute.attributes['aria-pressed'];
  run("keydown({code:'Enter',repeat:false,target:mute,preventDefault(){}})");
  assert.equal(run('state.phase'), 'cooking', 'Enter on a focused mute button starts gameplay');
  run("keydown({code:'Space',repeat:false,target:mute,preventDefault(){}})");
  assert.equal(run('input.space'), true);
  assert.equal(mute.attributes['aria-pressed'], beforeMute, 'Space and Enter never change mute');
  run("keyup({code:'Space',target:mute,preventDefault(){}})");
  assert.equal(run('input.space'), false, 'Space released on a button cannot stick');
  run('input.space=true; input.pointers.add(99);');
  ui.handlers.get('window:blur')();
  assert.equal(run('isVenting()'), false, 'blur releases all sources');
  run('input.space=true; input.pointers.add(99);');
  ui.document.hidden = true;
  ui.handlers.get('document:visibilitychange')();
  assert.equal(run('isVenting()'), false, 'hiding the document releases all sources');
  text.length = 0;
  run("setInputType('mouse'); render();");
  if (width > height) {
    assert.ok(text.includes('HOLD CLICK'));
    assert.ok(!text.includes('[ SPACE ]'), 'mouse controls do not show a Space badge');
    text.length = 0;
    run("setInputType('keyboard'); render();");
    assert.ok(text.includes('HOLD SPACE'));
    assert.ok(text.includes('[ SPACE ]'));
    text.length = 0;
    run("setInputType('touch'); render();");
    assert.ok(text.includes('HOLD / TAP'));
    assert.ok(!text.some(label => /SPACE|ENTER/.test(label)));
    assert.ok(!mute.textContent.includes('· M'));
  }
  ui.labels.length = 0;
  run("feedback('COMBO ×2!', true); state.hintOpacity=1; render();");
  const popup = ui.labels.find(label => label.value === 'COMBO ×2!');
  const title = ui.labels.find(label => label.value === 'POD PRESSURE');
  const fontSize = label => Number(label.font.match(/([.\d]+)px/)[1]);
  assert.ok(popup.y + fontSize(popup) / 2 < title.y - fontSize(title) / 2,
    'popup occupies a reserved line above the dial title');
  assert.ok(popup.y > -run('CONFIG.layout.pod.gaugeR') + fontSize(popup),
    'popup stays inside the dial, clear of the pod rim');
  const hint = ui.labels.find(label => label.value === run('ventInstruction()'));
  assert.ok(hint.y + 30 < run('scene.h * CONFIG.layout.room.floorY'),
    'hint stays above the console');
  const result = `${width}×${height}: service won in ${winTime.toFixed(1)}s; idle blowout ${lossTime.toFixed(1)}s`;
  console.log(result + '; controls, labels, mute, hint and replay passed.');
}
// Layout regressions at the two judged mobile sizes, plus both desktop sizes.
for (const [width, height] of [[1440, 900], [1280, 800], [390, 844], [360, 740]]) {
  const ui = setup(width, height);
  const { run, labels, replay, text } = ui;
  run('render();');
  const instruction = run('ventInstruction()');
  assert.equal(text.filter(label => label === instruction).length, 2,
    'the ready banner and hint use exactly the same instruction');
  const fontSize = label => Number(label.font.match(/([.\d]+)px/)[1]);
  const caution = labels.find(label => label.value === 'CAUTION / LIVE STEAM');
  const caption = labels.find(label => label.value.startsWith('BATCH 1/5 ·'));
  assert.ok(caution.y - fontSize(caution) / 2 > caption.y + fontSize(caption) / 2 + 20,
    'caution sign has clear space below the progress caption');
  const hint = labels.filter(label => label.value === instruction).at(-1);
  if (width < height) {
    const pipeY = run('scene.h * .65');
    assert.ok(hint.y - 20 > pipeY + 30, 'mobile hint clears the horizontal pipe');
  } else {
    const hintRight = run('scene.w * CONFIG.layout.hint.wideX + CONFIG.layout.hint.wideWidth / 2');
    const handleLeft = run(`scene.podX - (CONFIG.layout.pod.w / 2 + CONFIG.layout.pod.handleReach
      + CONFIG.layout.pod.handleStroke / 2) * scene.unit`);
    assert.ok(hintRight + 10 < handleLeft, 'desktop hint clears the left handle');
  }
  for (let index = 0; index < 5; index++) {
    labels.length = 0;
    run(`state.phase='cooking'; state.batchIndex=${index};
      state.cookTime=KitchenPhysics.batch(state).seconds; render();`);
    const seconds = run('KitchenPhysics.batch(state).seconds.toFixed(1)');
    assert.ok(labels.some(label => label.value.includes(`${seconds}/${seconds}s IN ZONE`)),
      'current and required cook time both use one decimal');
  }
  labels.length = 0;
  run("state.phase='batch'; feedback('BATCH COOKED! +1 DISH',true); render();");
  if (width < height) {
    const popup = labels.find(label => label.value === 'BATCH COOKED! +1 DISH');
    const tick = labels.find(label => label.value === '70');
    const popupHalf = popup.value.length * fontSize(popup) * .6 / 2;
    const tickHalf = tick.value.length * fontSize(tick) * .6 / 2;
    assert.ok(popupHalf + 4 < tick.x - tickHalf, 'long mobile popup clears the side tick labels');
  }
  for (const phase of ['victory', 'gameover']) {
    labels.length = 0;
    run(`state.phase='${phase}'; state.resultTime=3; positionReplay(); render();`);
    assert.ok(!labels.some(label => /TAP TO PLAY AGAIN|PLAY AGAIN ·/.test(label.value)),
      'canvas does not duplicate or hide a replay label under the DOM button');
    const box = run('replayPlacement()');
    assert.equal(parseFloat(replay.style.width), box.width);
    assert.equal(parseFloat(replay.style.height), box.height);
    const estimatedTextWidth = replay.textContent.length * box.font * .62;
    const padding = run('CONFIG.layout.replay.padding');
    assert.ok(estimatedTextWidth + padding * 2 + 2 < box.width, 'replay label fits on one line');
    const panelBottom = run(`(scene.h / 2
      + (${phase === 'victory' ? 'victoryLayout()' : 'CONFIG.layout.overlay'}.h / 2)) * view.scale`);
    assert.ok(box.top + box.height + 8 < panelBottom, 'replay button stays inside the result panel');
    if (phase === 'victory' && width < height) {
      const chefBottom = run(`(scene.h / 2 + victoryLayout().chefY
        + 199 * victoryLayout().chefScale) * view.scale`);
      assert.ok(box.top > chefBottom + 12, 'mobile replay button has breathing room below Gasket');
    }
  }
}
const focusCase = setup(1440, 900);
focusCase.mute.focus();
focusCase.mute.handlers.get('click')({ detail: 1 });
assert.equal(focusCase.document.activeElement, focusCase.canvas);
focusCase.run("keydown({code:'Enter',repeat:false,target:canvas,preventDefault(){}})");
assert.equal(focusCase.run('state.phase'), 'cooking', 'Enter starts after clicking Mute in ready');
focusCase.run("keydown({code:'Space',repeat:false,target:canvas,preventDefault(){}})");
assert.equal(focusCase.run('input.space'), true, 'Space vents after clicking Mute');
focusCase.run("keyup({code:'Space',target:replay,preventDefault(){throw Error('Native replay blocked')}})");
assert.equal(focusCase.run('input.space'), false, 'Space release also clears input on Replay');
// A tablet starts in touch mode; actual keys or mouse input take precedence afterward.
const tablet = setup(390, 844);
assert.equal(tablet.run('inputType'), 'touch');
tablet.run("keydown({code:'Space',repeat:false,preventDefault(){}}); render();");
assert.equal(tablet.run('touchUI()'), false);
assert.ok(tablet.text.includes('[ SPACE ]'));
assert.ok(tablet.mute.textContent.includes('· M'));
tablet.run("keyup({code:'Space',preventDefault(){}});");
tablet.text.length = 0;
tablet.run("pointerdown({button:0,pointerId:1,pointerType:'mouse',preventDefault(){}}); render();");
assert.equal(tablet.run('inputType'), 'mouse');
assert.ok(tablet.text.includes('[ CLICK ]'));
assert.ok(!tablet.text.includes('[ TOUCH ]'));
tablet.run("releasePointer({pointerId:1});");
tablet.text.length = 0;
tablet.run("pointerdown({button:0,pointerId:2,pointerType:'touch',preventDefault(){}}); render();");
assert.equal(tablet.run('touchUI()'), true);
assert.ok(!tablet.text.some(label => /SPACE|ENTER/.test(label)));
assert.ok(!tablet.mute.textContent.includes('· M'));
// Browser key defaults are suppressed at both ends, without suppressing semantic clicks.
const accessible = setup(390, 844);
accessible.mute.handlers.get('click')({detail:0});
assert.equal(accessible.mute.attributes['aria-pressed'], 'true');
accessible.run(`
  let prevented = 0;
  for (const code of ['Enter', 'Space']) {
    keydown({code, target:mute, repeat:false, preventDefault(){prevented++;}});
    keyup({code, target:mute, preventDefault(){prevented++;}});
  }
`);
assert.equal(accessible.run('prevented'), 4);
assert.equal(accessible.mute.attributes['aria-pressed'], 'true');
assert.equal(accessible.run('state.phase'), 'cooking');
assert.equal(accessible.run('input.space'), false);
const unsupported = setup(390, 844, true);
unsupported.run("keydown({code:'Enter',repeat:false,preventDefault(){}}); Sound.toggle(); Sound.toggle();");
unsupported.tick(1);
assert.equal(unsupported.run('state.phase'), 'cooking', 'audio/storage failures remain silent and playable');
console.log('UI smoke checks passed. Browser rendering/audio review remains a separate check.');

// Frozen creator checks are deliberately excluded from project source formatting checks.
for (const name of ['index.html', 'README.md', 'test/physics.test.mjs', 'test/ui.test.mjs']) {
  const lines = readFileSync(new URL('../' + name, import.meta.url), 'utf8').split('\n');
  lines.forEach((line, index) => {
    assert.ok(line.length <= 120, `${name}:${index + 1} exceeds 120 characters`);
  });
}
