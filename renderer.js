/* Procedural art only: visual effects never alter the simulation. */
(function () {
  'use strict';
  window.createKitchenRenderer = function (canvas) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let kitchen;
  let visualTime = 0;
  let eventName = '';
  let eventAge = 10;
  const colors = { orange: '#F05A18', amber: '#FFB35C', text: '#F3EEE9', line: '#61412c', dark: '#0D0908' };
  function line(points, color, width = 1) {
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function rect(x, y, w, h, fill, stroke, radius = 0) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function circle(x, y, r, fill, stroke, width = 1) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function label(text, x, y, size = 10, color = '#967761', align = 'left') {
    ctx.font = `${size}px "Courier New", monospace`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y);
  }
  function bolt(x, y) { circle(x, y, 5, '#513826', '#77553c'); line([[x - 2, y + 2], [x + 2, y - 2]], '#1b110c', 2); }
  function pipe(points, width = 19) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    line(points, '#0a0705', width + 7); line(points, '#543824', width); line(points, '#785237', 2);
    ctx.lineCap = 'butt';
  }
  function gauge(x, y, value) {
    circle(x, y, 85, '#100b08', '#64452e', 7);
    circle(x, y, 75, '#1c140f', '#39271b', 1);
    if (kitchen.inZone && kitchen.state === 'cooking') {
      circle(x, y, 88, null, '#F05A18', 2);
      ctx.shadowColor = colors.orange; ctx.shadowBlur = 12;
    }
    const angle = n => (135 + n * 2.7) * Math.PI / 180;
    ctx.beginPath(); ctx.arc(x, y, 63, angle(65), angle(85)); ctx.strokeStyle = colors.orange; ctx.lineWidth = 12; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(x, y, 63, angle(90), angle(100)); ctx.strokeStyle = '#9c3412'; ctx.lineWidth = 5; ctx.stroke();
    for (let n = 0; n <= 100; n += 5) {
      const a = angle(n); const major = n % 20 === 0;
      line([[x + Math.cos(a) * 60, y + Math.sin(a) * 60], [x + Math.cos(a) * (major ? 50 : 56), y + Math.sin(a) * (major ? 50 : 56)]], '#b89b7e', major ? 2 : 1);
      if (major) label(String(n), x + Math.cos(a) * 40, y + Math.sin(a) * 40 + 3, 9, '#c5af99', 'center');
    }
    const a = angle(value);
    line([[x - Math.cos(a) * 13, y - Math.sin(a) * 13], [x + Math.cos(a) * 57, y + Math.sin(a) * 57]], colors.amber, 3);
    circle(x, y, 6, colors.orange, '#edac69'); label('PSI', x, y + 33, 10, '#ad8c6d', 'center');
  }
  function scene() {
    if (!ctx) return;
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * dpr));
    const height = Math.max(1, Math.round(bounds.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#100b09'; ctx.fillRect(0, 0, width, height);
    // Preserve the vessel's proportions at every viewport aspect ratio.
    const compact = bounds.width < 500;
    const scale = Math.min(width / (compact ? 520 : 800), height / 540);
    ctx.setTransform(scale, 0, 0, scale, (width - 800 * scale) / 2, (height - 540 * scale) / 2);
    if (eventName === 'over' && eventAge < .65 && !reducedMotion.matches) {
      const shake = (1 - eventAge / .65) * 5;
      ctx.translate(Math.sin(eventAge * 70) * shake, Math.cos(eventAge * 53) * shake);
    }
    ctx.fillStyle = '#100b09'; ctx.fillRect(0, 0, 800, 540);
    for (let x = 0; x < 800; x += 40) line([[x, 0], [x, 540]], '#20150f');
    for (let y = 0; y < 540; y += 40) line([[0, y], [800, y]], '#20150f');
    const glow = ctx.createRadialGradient(390, 385, 10, 390, 385, 320);
    glow.addColorStop(0, kitchen.inZone ? '#F05A1845' : '#F05A1825'); glow.addColorStop(1, '#F05A1800'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 800, 540);
    pipe([[0, 110], [134, 110], [134, 296], [244, 296]], 22);
    pipe([[530, 248], [660, 248], [660, 78], [800, 78]], 22);
    rect(76, 215, 115, 155, '#1a120d', '#44301f', 5);
    for (const [x, y] of [[85, 225], [180, 225], [85, 360], [180, 360]]) bolt(x, y);
    if (!compact) label('HEAT SUPPLY', 133, 244, 9, '#b7997e', 'center');
    for (let i = 0; i < 5; i++) rect(96 + i * 16, 264, 8, 40, i < Math.ceil(kitchen.heatRate - 3.5) && kitchen.state === 'cooking' ? colors.orange : '#38261b');
    if (!compact) label(kitchen.state === 'cooking' ? 'BURNER / ON' : 'BURNER / OFF', 133, 333, 8, colors.amber, 'center');
    line([[560, 325], [620, 325], [640, 345], [742, 345]], '#68432a');
    if (!compact) { label('65–85 PSI', 640, 368, 14, colors.amber); label('COOKING ZONE', 640, 386, 9); }
    line([[420, 113], [485, 54], [582, 54]], '#68432a'); label('RELIEF VALVE', 490, 42, 9);
    rect(285, 407, 22, 75, '#39251a', '#62412b', 4); rect(483, 407, 22, 75, '#39251a', '#62412b', 4);
    rect(265, 477, 62, 10, '#503322', '#714b30', 3); rect(463, 477, 62, 10, '#503322', '#714b30', 3);
    rect(320, 425, 150, 51, '#100b08', '#6e452a', 6);
    if (kitchen.state === 'cooking') {
      for (let i = 0; i < 7; i++) {
        const x = 334 + i * 20; const flicker = reducedMotion.matches ? 0 : Math.sin(visualTime * (8 + kitchen.stage * 2) + i * 2) * (5 + kitchen.stage * 2);
        ctx.beginPath(); ctx.moveTo(x - 7, 459); ctx.quadraticCurveTo(x - 8, 445, x, 435 + flicker); ctx.quadraticCurveTo(x + 8, 449, x + 6, 459); ctx.fillStyle = i % 2 ? colors.orange : colors.amber; ctx.fill();
      }
    }
    for (let x = 327; x < 470; x += 20) line([[x, 432], [x, 471]], '#5c3b27', 3);
    const metal = ctx.createLinearGradient(245, 0, 550, 0);
    metal.addColorStop(0, '#342216'); metal.addColorStop(.28, '#71462a'); metal.addColorStop(.54, '#52321f'); metal.addColorStop(1, '#24170f');
    rect(245, 162, 305, 264, metal, '#94623c', 68); rect(257, 204, 280, 168, '#2a1c14', '#6a452b', 16);
    rect(234, 183, 327, 27, '#4e3321', '#9b663e', 6); rect(235, 371, 325, 26, '#4e3321', '#8b5936', 6);
    for (let x = 253; x < 560; x += 37) { bolt(x, 196); bolt(x, 384); }
    gauge(397, 285, kitchen.pressure); rect(343, 401, 110, 20, '#1c120c', '#735032', 3);
    label('GASKET / 001', 398, 414, 9, colors.amber, 'center');
    rect(327, 146, 140, 19, '#4f3320', '#92613b', 5); rect(377, 112, 40, 35, '#63432a', '#986c43', 4);
    ctx.save();
    if (kitchen.state === 'over') {
      const flight = reducedMotion.matches ? 1 : Math.min(1, eventAge * 1.8);
      ctx.translate(50 * flight, -70 * flight); ctx.translate(397, 110); ctx.rotate(.45 * flight); ctx.translate(-397, -110);
    }
    rect(354, 104, 86, 13, kitchen.venting ? colors.amber : '#bd632b', '#e4974c', 4); circle(397, 110, 7, '#342012', '#f7a65b');
    ctx.restore();
    // Gasket's face: sleepy at rest, intent under pressure, delighted at service.
    for (const x of [370, 423]) {
      if (kitchen.state === 'over') {
        line([[x-6, 167], [x+6, 177]], colors.amber, 3);
        line([[x-6, 177], [x+6, 167]], colors.amber, 3);
      } else if (kitchen.state === 'served' || kitchen.state === 'victory') {
        ctx.beginPath(); ctx.arc(x, 173, 7, Math.PI, 2 * Math.PI); ctx.strokeStyle = colors.amber; ctx.lineWidth = 3; ctx.stroke();
      } else {
        const blink = !reducedMotion.matches && visualTime % 5.4 > 5.23;
        rect(x-7, blink ? 172 : 166, 14, blink ? 2 : kitchen.pressure > 85 ? 12 : 8, colors.amber, null, 3);
        if (kitchen.pressure > 85) line([[x-9, 160], [x+8, 163]], colors.orange, 3);
      }
    }
    line([[389, 176], [397, kitchen.inZone ? 180 : 176], [405, 176]], colors.amber, 2);
    if ((kitchen.venting && kitchen.state === 'cooking') || kitchen.state === 'over') {
      const count = reducedMotion.matches ? 5 : kitchen.state === 'over' ? 26 : 16;
      for (let i = 0; i < count; i++) {
        const phase = reducedMotion.matches ? i / count : (((kitchen.state === 'over' ? eventAge : visualTime) * .85 + i / count) % 1);
        const x = 397 + Math.sin(i * 2.4 + phase * 3) * (10 + phase * 50);
        ctx.globalAlpha = (1 - phase) * .32; circle(x, 99 - phase * 100, 7 + phase * 20, '#F3EEE9');
      }
      ctx.globalAlpha = 1;
    }
    const warning = kitchen.pressure > 85;
    circle(585, 171, 11, warning ? colors.orange : '#38261a', '#785133', 2);
    if (warning) {
      const urgency = Math.max(0, (kitchen.pressure - 85) / 15);
      ctx.globalAlpha = reducedMotion.matches ? .5 : .35 + .2 * Math.sin(visualTime * (4 + urgency * 4));
      circle(585, 171, 18 + urgency * 10, colors.orange);
      ctx.globalAlpha = 1;
    }
    label(warning ? 'VENT!' : 'LIMIT', 585, 195, 9, warning ? colors.amber : '#967761', 'center');
    line([[200, 501], [600, 501]], '#4f3321'); label(kitchen.overtime ? 'OVERTIME / THE NIGHT NEVER ENDS' : `ORDER ${kitchen.stage + 1} / ${kitchen.order.name.toUpperCase()}`, 400, 526, 10, '#b08b6a', 'center');
    // A row of inspection lights fills as the current dish cooks.
    for (let i = 0; i < 10; i++) {
      const on = kitchen.overtime || kitchen.progress / kitchen.order.target >= (i + 1) / 10;
      circle(320 + i * 17, 408, 2, on ? colors.amber : '#463021');
    }
    if ((eventName === 'served' || eventName === 'victory') && eventAge < 2 && !reducedMotion.matches) {
      for (let i = 0; i < 28; i++) {
        const a = i * 2.399; const radius = 35 + eventAge * (70 + i % 4 * 20);
        ctx.globalAlpha = Math.max(0, 1 - eventAge / 2);
        rect(397 + Math.cos(a) * radius, 280 + Math.sin(a) * radius - eventAge * 45 + eventAge * eventAge * 30, 4, 8, i % 2 ? colors.orange : colors.amber);
      }
      ctx.globalAlpha = 1;
    }
    if (eventName === 'over' && eventAge < .8 && !reducedMotion.matches) {
      ctx.globalAlpha = (1 - eventAge / .8) * .35;
      circle(397, 130, 30 + eventAge * 290, '#FFB35C'); ctx.globalAlpha = 1;
      for (let i = 0; i < 16; i++) {
        const a = i * .3927;
        line([[397 + Math.cos(a) * eventAge * 200, 130 + Math.sin(a) * eventAge * 200], [397 + Math.cos(a) * (eventAge * 200 + 16), 130 + Math.sin(a) * (eventAge * 200 + 16)]], colors.orange, 2);
      }
    }
  }
  return {
    event(name) { eventName = name; eventAge = 0; },
    draw(model, dt) {
      kitchen = model;
      eventAge += Math.min(dt, .1);
      if (model.state === 'cooking' || model.state === 'ready') visualTime += Math.min(dt, .1);
      scene();
    }
  };
  };
  window.drawKitchenDish = function (canvas, stage) {
    const c = canvas.getContext('2d'); if (!c) return;
    c.clearRect(0, 0, 220, 80); c.lineWidth = 2;
    c.fillStyle = '#27180e'; c.strokeStyle = '#b77543';
    c.beginPath(); c.ellipse(110, 65, 76, 8, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    if (stage === 0) {
      c.fillStyle = '#95532b'; c.beginPath(); c.arc(110, 40, 48, 0, Math.PI); c.fill();
      c.fillStyle = '#F05A18'; c.beginPath(); c.ellipse(110, 40, 48, 11, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#FFB35C';
      for (const [x,y] of [[87,39],[110,43],[130,37]]) { c.beginPath(); c.ellipse(x,y,6,3,.2,0,Math.PI*2); c.fill(); }
    } else if (stage === 1) {
      for (const x of [77,110,143]) {
        c.fillStyle = '#d99a5c'; c.beginPath(); c.arc(x, 54, 18, Math.PI, 2*Math.PI); c.closePath(); c.fill();
        c.strokeStyle = '#8e4b25';
        for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x+i*5,52); c.lineTo(x+i*3,39); c.stroke(); }
      }
    } else {
      const gradient = c.createLinearGradient(60,0,160,0); gradient.addColorStop(0,'#6f3d22'); gradient.addColorStop(.4,'#edb47b'); gradient.addColorStop(1,'#86502c');
      c.fillStyle = gradient; c.beginPath(); c.arc(110,60,49,Math.PI,2*Math.PI); c.fill();
      c.fillStyle = '#FFB35C'; c.beginPath(); c.arc(110,10,5,0,Math.PI*2); c.fill();
      c.fillRect(56,58,108,5);
    }
    if (stage < 2) {
      c.strokeStyle = '#FFB35C'; c.globalAlpha = .6;
      for (const x of [95,112,129]) { c.beginPath(); c.moveTo(x,26); c.bezierCurveTo(x-9,20,x+9,14,x,7); c.stroke(); }
      c.globalAlpha = 1;
    }
  };
})();
