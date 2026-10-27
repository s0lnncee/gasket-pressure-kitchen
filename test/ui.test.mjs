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
  const stored = new Map();
  const handlers = new Map();
  let audioContexts = 0;
  const noop = () => {};
  class Button {
    hidden = true;
    style = {};
    attributes = {};
    handlers = new Map();
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { this.handlers.set(name, handler); }
    focus() {}
  }
  const graphics = new Proxy({ fillText: value => text.push(value) }, {
    get: (object, key) => object[key] ?? (key.startsWith('create') ? () => ({ addColorStop: noop }) : noop)
  });
  const canvas = {
    style: {},
    getContext: () => graphics,
    addEventListener: (name, handler) => handlers.set(name, handler),
    setPointerCapture: noop,
    focus: noop
  };
  const replay = new Button();
  const mute = new Button();
  const elements = { kitchen: canvas, replay, mute, announcement: {} };
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
    document: { getElementById: id => elements[id], addEventListener: noop },
    window: { innerWidth: width, innerHeight: height, devicePixelRatio: 1, AudioContext: Audio, addEventListener: noop },
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
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: noop
  };
  vm.createContext(context);
  for (const script of scripts) vm.runInContext(script, context);
  const run = code => vm.runInContext(code, context);
  const tick = seconds => run(`for(let i=0;i<Math.ceil(${seconds}/CONFIG.step);i++) update(CONFIG.step); render();`);
  return { run, tick, canvas, mute, replay, stored, text, handlers, audioContexts: () => audioContexts };
}

for (const [width, height] of [[1440, 900], [390, 844]]) {
  const ui = setup(width, height);
  const { run, tick, text, replay, mute } = ui;
  run('render()');
  assert.ok(text.includes('HOLD SPACE, CLICK OR TOUCH TO VENT'));
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
  mute.handlers.get('click')();
  assert.equal(mute.attributes['aria-pressed'], 'false');

  // Same measured threshold player through keyboard on desktop and touch on mobile.
  run(`
    let nextDecision = state.elapsed;
    let holding = false;
    while ((state.phase === 'cooking' || state.phase === 'batch') && state.elapsed < 180) {
      if (state.elapsed >= nextDecision) {
        const target = KitchenPhysics.batch(state);
        const next = state.pressure > target.high - 1 ? true : state.pressure < target.low + 1 ? false : holding;
        if (next !== holding) {
          if (${width} > ${height}) {
            if (next) keydown({code:'Space',repeat:false,preventDefault(){}});
            else keyup({code:'Space',preventDefault(){}});
          } else {
            if (next) pointerdown({button:0,pointerId:7,clientX:5,clientY:5,preventDefault(){}});
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
  run('pointerdown({button:0,pointerId:3,clientX:2,clientY:2,preventDefault(){}})');
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
  assert.ok(text.some(label => label.includes('VALVE BLOWN')) || width < height);
  run("keydown({code:'Space',repeat:false,preventDefault(){}})");
  assert.equal(run('input.space'), false, 'loss restart also leaves vent released');

  run('state.batchTime=6; state.pressure=91; state.velocity=0; update(CONFIG.step); render();');
  assert.ok(text.includes('CRITICAL · VENT NOW · SURGE INCOMING'), 'critical pressure cannot hide the surge warning');
  // Native Space/Enter activation of buttons must not be prevented by global controls.
  run("keydown({code:'Space',repeat:false,target:mute,preventDefault(){throw Error('Button key intercepted')}})");
  run("keyup({code:'Space',target:mute,preventDefault(){throw Error('Button key intercepted')}})");
  console.log(`${width}×${height}: service won in ${winTime.toFixed(1)}s; idle blowout ${lossTime.toFixed(1)}s; controls, labels, mute, hint and replay passed.`);
}
const unsupported = setup(390, 844, true);
unsupported.run("keydown({code:'Enter',repeat:false,preventDefault(){}}); Sound.toggle(); Sound.toggle();");
unsupported.tick(1);
assert.equal(unsupported.run('state.phase'), 'cooking', 'audio/storage failures remain silent and playable');
console.log('UI smoke checks passed. Browser rendering/audio review remains a separate check.');
