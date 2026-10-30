/* Browser adapter: input, accessible DOM feedback, sound and the animation clock. */
(function () {
  'use strict';
  const { Kitchen, ORDERS } = window.PressureKitchen;
  const kitchen = new Kitchen();
  const $ = id => document.getElementById(id);
  const view = window.createKitchenRenderer($('kitchen'));
  const lever = $('lever');
  const inputs = new Set();
  const storeKey = 'gasket-last-shift-best-v1';
  let best = 0;
  try { const n = Number(localStorage.getItem(storeKey)); if (Number.isSafeInteger(n) && n > 0) best = n; } catch { /* Storage is optional. */ }
  let lastFrame = null;
  let previousState = '';
  let previousZone = '';
  let soundEnabled = false;
  let audio = null;
  let audioFailed = false;

  function text(id, value) { const element = $(id); if (element.textContent !== String(value)) element.textContent = value; }
  function clearInput() { inputs.clear(); kitchen.setVenting(false); }
  function setInput(source, held) {
    if (held && kitchen.state === 'cooking') inputs.add(source); else inputs.delete(source);
    kitchen.setVenting(inputs.size > 0);
  }
  function persistBest() {
    best = Math.max(best, kitchen.score);
    try { localStorage.setItem(storeKey, String(best)); } catch { /* Play works without local storage. */ }
  }
  function tone(notes, duration = .11, waveform = 'sine') {
    if (!soundEnabled || !audio || audio.state !== 'running') return;
    notes.forEach((frequency, index) => {
      const start = audio.currentTime + index * duration;
      const oscillator = audio.createOscillator(); const volume = audio.createGain();
      oscillator.type = waveform; oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0, start); volume.gain.linearRampToValueAtTime(.035, start + .012);
      volume.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(volume); volume.connect(audio.destination); oscillator.start(start); oscillator.stop(start + duration);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    });
  }
  $('sound').addEventListener('click', async () => {
    if (audioFailed) return;
    try {
      if (!audio) { const Audio = window.AudioContext || window.webkitAudioContext; audio = new Audio(); }
      soundEnabled = !soundEnabled;
      if (soundEnabled) await audio.resume();
      $('sound').setAttribute('aria-pressed', String(soundEnabled));
      text('sound', soundEnabled ? 'Sound on' : 'Sound off'); tone([330, 440]);
    } catch { audioFailed = true; soundEnabled = false; text('sound', 'No audio'); $('sound').disabled = true; }
  });
  function pause() {
    clearInput(); kitchen.pause(); lastFrame = null; renderUI();
  }
  function act(action) {
    clearInput();
    if (action === 'start') kitchen.start();
    else if (action === 'resume') kitchen.resume();
    else if (action === 'next') kitchen.nextOrder();
    else if (action === 'overtime') kitchen.continueOvertime();
    else if (action === 'restart') { kitchen.reset(); kitchen.start(); }
    lastFrame = null; renderUI();
    if (kitchen.state === 'cooking') lever.focus({ preventScroll: true });
  }
  $('primary').addEventListener('click', () => act($('primary').dataset.action));
  $('secondary').addEventListener('click', () => act('restart'));
  $('pause').addEventListener('click', () => kitchen.state === 'paused' ? act('resume') : pause());
  function interactive(target) { return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select')); }
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === 'Tab' && !$('overlay').hidden) {
      const buttons = [$('primary'), $('secondary')].filter(button => !button.hidden);
      const index = buttons.indexOf(document.activeElement);
      if (index < 0 || (!event.shiftKey && index === buttons.length - 1) || (event.shiftKey && index === 0)) {
        event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus({ preventScroll: true });
      }
    } else if (event.code === 'Space' && (!interactive(event.target) || event.target === lever)) {
      event.preventDefault(); setInput('space', true);
    } else if (event.code === 'Enter' && event.target === lever) {
      event.preventDefault(); setInput('enter', true);
    } else if (event.code === 'KeyP' && !event.repeat) {
      if (kitchen.state === 'paused') act('resume'); else pause();
    } else if (event.code === 'Escape') pause();
  });
  document.addEventListener('keyup', event => {
    if (event.code === 'Space') setInput('space', false);
    if (event.code === 'Enter') setInput('enter', false);
  });
  lever.addEventListener('pointerdown', event => {
    if (event.button !== 0 || kitchen.state !== 'cooking') return;
    event.preventDefault(); lever.focus({ preventScroll: true });
    lever.setPointerCapture(event.pointerId); setInput(`pointer-${event.pointerId}`, true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    lever.addEventListener(type, event => setInput(`pointer-${event.pointerId}`, false));
  }
  lever.addEventListener('contextmenu', event => event.preventDefault());
  lever.addEventListener('blur', clearInput);
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);

  function showMoment(message) {
    text('moment', message); $('moment').classList.remove('show');
    // Restart this short CSS effect only on a meaningful state change.
    void $('moment').offsetWidth; $('moment').classList.add('show');
  }
  function dialog(state) {
    const configurations = {
      ready: ['◉', 'THE NIGHT CREW IS COUNTING ON YOU', 'Gasket’s last shift.', 'Three orders before sunrise. Keep the pressure at 65–85 PSI to cook. At 100, the valve blows.', 'Start shift', 'start'],
      paused: ['Ⅱ', 'BURNER ON HOLD', 'Take a breather.', 'Pressure, cooking progress and score are frozen. Nothing moves until you resume.', 'Resume shift', 'resume'],
      served: ['✓', `ORDER ${kitchen.stage + 1} / SERVED`, 'Order up!', `${kitchen.order.name} is ready. The crew sends its compliments.`, 'Cook next order', 'next'],
      victory: ['✦', 'THREE ORDERS. ONE VERY GOOD SHIFT.', 'You fed the crew.', 'The last supper is served. Gasket can finally clock out. Or stay for one more round of heat.', 'Continue into overtime', 'overtime'],
      over: ['×', 'VALVE BLOWOUT / 100 PSI', 'Game Over', kitchen.overtime ? 'The overtime rush got too hot. Your three-order victory still stands.' : 'The pressure won this round. Vent a little earlier on your next shift.', 'Play again', 'restart']
    };
    const data = configurations[state];
    $('overlay').hidden = !data;
    document.querySelector('.play-area').inert = Boolean(data);
    if (!data) return;
    text('overlay-mark', data[0]); text('overlay-kicker', data[1]); text('overlay-title', data[2]); text('overlay-detail', data[3]);
    $('primary').textContent = `${data[4]} ↗`; $('primary').dataset.action = data[5];
    $('secondary').hidden = state !== 'victory';
    $('how-to').hidden = state !== 'ready';
    $('dish-art').hidden = !['served', 'victory'].includes(state);
    if (!$('dish-art').hidden) window.drawKitchenDish($('dish-art'), kitchen.stage);
    $('result').hidden = !['served', 'victory', 'over'].includes(state);
    text('result-label', state === 'served' ? 'SHIFT SCORE' : 'FINAL SCORE'); text('final-score', kitchen.score);
    text('result-detail', `${kitchen.completed} / 3 served\n${kitchen.efficiency}% in the zone${state === 'served' || state === 'victory' ? `\n+${kitchen.lastBonus} service bonus` : ''}`);
    $('next-preview').hidden = state !== 'served';
    if (state === 'served') {
      const next = ORDERS[kitchen.stage + 1];
      text('next-preview', `NEXT: ${next.name} · ${next.target}s in zone · ${next.heat} PSI/s heat`);
    }
    text('overlay-note', state === 'ready' ? 'First order: 15 seconds in the zone. Take your time.' : state === 'served' ? 'Fresh load starts at 55 PSI. Continue when ready.' : state === 'victory' ? 'Overtime starts at 65 PSI. Your score carries over.' : state === 'paused' ? 'Hold Space or the lever to vent. Release to heat.' : 'Your personal best is kept when storage is available.');
    $('primary').focus({ preventScroll: true });
  }
  function renderUI() {
    const state = kitchen.state;
    const cooking = state === 'cooking';
    const zone = !cooking ? 'idle' : kitchen.pressure >= 93 ? 'danger' : kitchen.pressure > 85 ? 'hot' : kitchen.inZone ? 'sweet' : 'cold';
    $('console').dataset.zone = zone;
    const pressure = Math.floor(kitchen.pressure);
    text('pressure', pressure); text('score', String(kitchen.score).padStart(4, '0')); text('best', String(Math.max(best, kitchen.score)).padStart(4, '0'));
    $('pressure-meter').setAttribute('aria-valuenow', pressure);
    $('meter-needle').style.left = `${kitchen.pressure}%`;
    text('pressure-trend', cooking ? kitchen.venting ? '↓' : '↑' : '—');
    text('danger-label', zone === 'danger' ? 'VENT NOW!' : '100 PSI MAX');
    text('order-number', kitchen.overtime ? 'OVERTIME' : `ORDER 0${kitchen.stage + 1} / 03`);
    text('order-name', kitchen.overtime ? 'The night never ends' : kitchen.order.name);
    text('objective', kitchen.overtime ? 'Stay in the zone. Keep the score climbing.' : `${kitchen.order.target} seconds at 65–85 PSI`);
    text('progress-text', kitchen.overtime ? `${Math.floor(kitchen.overtimeElapsed)}s OT` : `${(Math.floor(kitchen.progress * 10 + 1e-8) / 10).toFixed(1)} / ${kitchen.order.target}s`);
    $('cook-progress').max = kitchen.order.target; $('cook-progress').value = kitchen.overtime ? kitchen.order.target : kitchen.progress;
    text('intensity', kitchen.overtime ? '∞ OVERTIME' : `${['Ⅰ', 'Ⅱ', 'Ⅲ'][kitchen.stage]} ${kitchen.order.intensity} HEAT`);
    [...$('order-steps').children].forEach((item, i) => {
      item.classList.toggle('done', i < kitchen.completed);
      if (i === kitchen.stage && !kitchen.overtime && kitchen.completed <= i) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      item.querySelector('span').textContent = i < kitchen.completed ? '✓' : `0${i + 1}`;
    });
    lever.disabled = !cooking; lever.setAttribute('aria-pressed', String(kitchen.venting));
    text('valve-state', kitchen.venting ? 'VENTING' : 'CLOSED');
    text('feed-status', cooking ? kitchen.venting ? '● VENTING' : '● COOKING' : state === 'over' ? '● OFFLINE' : state === 'ready' ? '● STANDING BY' : '● BURNER OFF');
    const status = !cooking ? {ready:'READY WHEN YOU ARE', paused:'SHIFT PAUSED', served:'ORDER COMPLETE', victory:'SHIFT COMPLETE', over:'VALVE BLOWOUT'}[state] : zone === 'danger' ? 'DANGER · HOLD TO VENT' : zone === 'hot' ? 'TOO HOT · VENT' : zone === 'sweet' ? 'SWEET SPOT · COOKING' : 'WARMING · RELEASE';
    text('status', status);
    text('advice', !cooking ? state === 'over' ? '100 PSI. Burner shut down.' : 'Pressure is safely on hold.' : zone === 'danger' ? 'Keep holding. Bring it below 85.' : zone === 'hot' ? 'Progress waits. Bring it below 85.' : zone === 'sweet' ? 'Short holds. Keep the needle orange.' : 'Let pressure climb to 65 PSI.');
    const line = state === 'ready' ? '“Three orders left. Then we clock out.”' : state === 'over' ? '“Well… that was not the dinner bell.”' : state === 'served' ? '“Order up. Still got it.”' : state === 'victory' ? '“Nobody goes home hungry.”' : state === 'paused' ? '“Take your time. I’ll keep it warm.”' : zone === 'danger' ? '“Valve. Now. Please.”' : zone === 'hot' ? '“A little steam off the top?”' : zone === 'sweet' ? ['“That’s it. Let it simmer.”', '“The crew’s going to love these.”', '“Steady hands. We’re almost home.”'][kitchen.stage] : '“Let the heat do its thing.”';
    text('gasket-line', line);
    if (zone !== previousZone && cooking) {
      if (zone === 'sweet') { showMoment('IN THE ZONE · +10 PTS / SEC'); tone([440, 554], .09); }
      else if (zone === 'danger') { showMoment('PRESSURE CRITICAL · VENT'); tone([165, 165], .15, 'triangle'); }
      else if (previousZone === 'sweet') showMoment('COOKING PAUSED · PROGRESS SAVED');
    }
    previousZone = zone;
    if (state !== previousState) {
      clearInput();
      $('console').dataset.state = state;
      $('pause').disabled = !['cooking', 'paused'].includes(state); text('pause', state === 'paused' ? 'Resume ▷' : 'Pause Ⅱ');
      view.event(state);
      if (state === 'served') tone([330, 440, 660]);
      if (state === 'victory') tone([330, 440, 554, 660, 880], .15);
      if (state === 'over') tone([180, 110, 65], .18, 'sawtooth');
      if (['served', 'victory', 'over'].includes(state)) persistBest();
      dialog(state); previousState = state;
    }
  }
  function frame(now) {
    const dt = lastFrame === null ? 0 : Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now; kitchen.advance(dt); renderUI(); view.draw(kitchen, dt); requestAnimationFrame(frame);
  }
  renderUI(); requestAnimationFrame(frame);
})();
