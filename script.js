/* LONE RACER - Full build
   - Canvas-based neon racer
   - Powerups: yellow (speed), black (blind/red), green (gun), pink (shield)
   - Night cycle: 90s period, 30s night
   - 3 hearts (lives). Shield consumes hits while active.
   - Enemies: multiple shapes/sizes/styles
   - Score bar, high score in localStorage
   - Audio: WebAudio API procedural (no files required)
*/

// CONFIG
const cfg = {
  width: 640, height: 960,
  lanes: 3,
  baseSpeed: 6,
  enemySpawnMs: 1000,
  powerSpawnMs: 6000,
  night: { period: 90000, duration: 30000 }, // ms
  durations: { speed:10000, blind:10000, gun:15000, shield:10000 }
};

// CANVAS SETUP
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let scale = 1;
function resize() {
  const w = Math.min(window.innerWidth, 720);
  const h = Math.max(window.innerHeight - 120, 560);
  canvas.width = w * devicePixelRatio;
  canvas.height = h * devicePixelRatio;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  scale = canvas.width / cfg.width;
  ctx.setTransform(scale,0,0,scale,0,0);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);
resize();

// STATE
let running = false, last = 0, gameStartAt = 0, spawnEnemyTimer = 0, spawnPowerTimer = 0;
let isNight = false;
const state = {
  player: null,
  enemies: [],
  powerups: [],
  bullets: [],
  particles: [],
  score: 0,
  high: Number(localStorage.getItem('loneHigh')||0),
  lives: 3,
  powerTimers: { speed:0, blind:0, gun:0, shield:0 },
  scoreProgress: 0 // 0..1 for score bar
};

// UTIL
const rand = (a,b)=>Math.random()*(b-a)+a;
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
function laneX(i){ const margin=60, usable = cfg.width - margin*2, laneW = usable/cfg.lanes; return margin + laneW*(i+0.5); }

// ENTITIES
function createPlayer(){
  return { lane:1, x:laneX(1), y: cfg.height - 160, w:48, h:96, shield:false, shootCd:0 };
}

function spawnEnemy(){
  // enemy types: small (fast), medium, large (slow), wide (tank)
  const types = [
    { w:36,h:72,s:1.6, color:'#ff3fbf' }, // small
    { w:48,h:94,s:1.0, color:'#ff9ecf' }, // medium
    { w:70,h:110,s:0.7, color:'#a24aff' }, // large
    { w:88,h:60,s:0.9, color:'#ff6a3f' }   // wide
  ];
  const t = pick(types);
  const lane = Math.floor(rand(0,cfg.lanes));
  state.enemies.push({
    ...t,
    lane, x: laneX(lane),
    y: -120 - rand(0,160),
    speed: cfg.baseSpeed * (0.8 + rand(0,0.6)) * t.s
  });
}

function spawnPowerup(){
  const types = ['speed','blind','gun','shield'];
  const t = pick(types);
  const lane = Math.floor(rand(0,cfg.lanes));
  const color = t==='speed' ? '#ffd24a' : t==='blind' ? '#000000' : t==='gun' ? '#23ff6b' : '#ff3fbf';
  state.powerups.push({
    type: t,
    lane, x: laneX(lane),
    y: -80 - rand(0,80),
    w:36, h:36, color
  });
}

// PARTICLES/EXPLOSIONS
function spawnExplosion(x,y,baseColor='#ff7a3f', size=14){
  for(let i=0;i<size;i++){
    state.particles.push({
      x, y,
      vx: rand(-4,4),
      vy: rand(-6,2),
      life: rand(400,1000),
      size: rand(2,6),
      color: baseColor
    });
  }
  // small screen shake
  shake(6);
}

// SCREEN SHAKE
let shakeAmt = 0;
function shake(v){ shakeAmt = Math.max(shakeAmt, v); }

// AUDIO (WebAudio procedural)
let audioCtx=null;
function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
let musicOn = true, bgNodes = null;
function startMusic(){
  if(!musicOn) return;
  ensureAudio();
  if(bgNodes) return;
  const ctxA = audioCtx;
  const master = ctxA.createGain(); master.gain.value = 0.05; master.connect(ctxA.destination);
  const osc = ctxA.createOscillator(); osc.type='sawtooth'; osc.frequency.value = 80;
  const osc2 = ctxA.createOscillator(); osc2.type='sine'; osc2.frequency.value = 220;
  const gain2 = ctxA.createGain(); gain2.gain.value = 0.03;
  osc.connect(master);
  osc2.connect(gain2); gain2.connect(master);
  const lfo = ctxA.createOscillator(); lfo.frequency.value=0.2; const lfoG = ctxA.createGain(); lfoG.gain.value=0.03;
  lfo.connect(lfoG); lfoG.connect(osc.frequency);
  osc.start(); osc2.start(); lfo.start();
  bgNodes = { osc, osc2, lfo, master, gain2 };
}
function stopMusic(){
  if(!bgNodes) return;
  try{ bgNodes.osc.stop(); bgNodes.osc2.stop(); bgNodes.lfo.stop(); }catch(e){}
  bgNodes = null;
}
function toggleMusic(on){
  musicOn = on;
  if(on) startMusic(); else stopMusic();
}
function sfx(type){
  ensureAudio();
  const ctxA = audioCtx;
  const o = ctxA.createOscillator();
  const g = ctxA.createGain();
  o.connect(g); g.connect(ctxA.destination);
  if(type==='pickup'){ o.type='sine'; o.frequency.value=1000; g.gain.value=0.06; }
  if(type==='explode'){ o.type='sawtooth'; o.frequency.value=120; g.gain.value=0.08; }
  if(type==='crash'){ o.type='square'; o.frequency.value=60; g.gain.value=0.08; }
  if(type==='shoot'){ o.type='triangle'; o.frequency.value=1200; g.gain.value=0.04; }
  if(type==='shield'){ o.type='sine'; o.frequency.value=600; g.gain.value=0.05; }
  o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime + 0.3); o.stop(ctxA.currentTime + 0.32);
}

// INPUT
const keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if(e.key===' ') { e.preventDefault(); tryShoot(); }});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
document.getElementById('leftBtn').addEventListener('touchstart', ()=> keys['arrowleft']=true);
document.getElementById('leftBtn').addEventListener('touchend', ()=> keys['arrowleft']=false);
document.getElementById('rightBtn').addEventListener('touchstart', ()=> keys['arrowright']=true);
document.getElementById('rightBtn').addEventListener('touchend', ()=> keys['arrowright']=false);
document.getElementById('shootBtn').addEventListener('touchstart', (ev)=>{ ev.preventDefault(); tryShoot(); });

// UI buttons
document.getElementById('startBtn').onclick = start;
document.getElementById('restartBtn').onclick = reset;
document.getElementById('musicToggle').onchange = (e)=> toggleMusic(e.target.checked);

// MESSAGE UI
function showTag(text, bg='#ffd24a', color='#000', ms=3500){
  const el = document.getElementById('messages');
  el.innerHTML = `<div class="tagline" style="background:${bg}; color:${color}">${text}</div>`;
  setTimeout(()=>{ if(el.innerHTML.includes(text)) el.innerHTML=''; }, ms);
}

// HUD updates
function updateHUD(){
  document.getElementById('score').textContent = Math.floor(state.score);
  document.getElementById('highscore').textContent = Math.floor(state.high);
  // score bar fill
  document.getElementById('scoreBarFill').style.width = Math.min(100, Math.floor(state.scoreProgress*100)) + '%';
  // hearts
  const hearts = document.getElementById('hearts');
  hearts.innerHTML = '';
  for(let i=0;i<3;i++){
    const el = document.createElement('div');
    el.className = 'heart';
    if(i < state.lives) el.textContent = '♥'; else { el.textContent = '♡'; el.style.opacity = 0.28; }
    hearts.appendChild(el);
  }
}

// GAME LOGIC
function reset(){
  running = false; stopMusic();
  state.player = createPlayer();
  state.enemies = []; state.powerups = []; state.bullets = []; state.particles = [];
  state.score = 0; state.scoreProgress = 0; state.lives = 3;
  state.powerTimers = { speed:0, blind:0, gun:0, shield:0 };
  updateHUD();
  draw();
}
reset();

function start(){
  if(!running){
    running = true;
    spawnEnemyTimer = 0; spawnPowerTimer = 0;
    last = performance.now(); gameStartAt = performance.now();
    if(musicOn) startMusic();
    requestAnimationFrame(loop);
  }
}

function endGame(){
  running = false;
  stopMusic();
  if(state.score > state.high) { state.high = Math.floor(state.score); localStorage.setItem('loneHigh', state.high); }
  showTag('GAME OVER — Press Start or Restart', '#ff4b6b', '#fff', 5000);
  updateHUD();
}

// SHOOTING
function tryShoot(){
  if(state.powerTimers.gun > 0){
    if(state.player.shootCd <= 0){
      state.player.shootCd = 140; // ms
      state.bullets.push({ x: state.player.x, y: state.player.y - 80, vy: -18, r:6 });
      sfx('shoot');
    }
  }
}

// MAIN LOOP
function loop(now){
  const dt = Math.min(40, now - last); last = now;
  if(!running){ draw(); return; }

  // night cycle
  const sinceStart = now - gameStartAt;
  isNight = (sinceStart % cfg.night.period) < cfg.night.duration;

  // spawn timers
  spawnEnemyTimer += dt;
  if(spawnEnemyTimer > cfg.enemySpawnMs){
    spawnEnemyTimer = 0;
    spawnEnemy();
  }
  spawnPowerTimer += dt;
  if(spawnPowerTimer > cfg.powerSpawnMs){
    spawnPowerTimer = 0;
    spawnPowerup();
  }

  // input lane move (instant lane-based)
  if((keys['arrowleft'] || keys['a']) && state.player.lane > 0){
    state.player.lane--; state.player.x = laneX(state.player.lane);
    keys['arrowleft'] = keys['a'] = false;
  } else if((keys['arrowright'] || keys['d']) && state.player.lane < cfg.lanes-1){
    state.player.lane++; state.player.x = laneX(state.player.lane);
    keys['arrowright'] = keys['d'] = false;
  }

  // update power timers
  const dtMs = dt;
  for(const k of Object.keys(state.powerTimers)){
    if(state.powerTimers[k] > 0){
      state.powerTimers[k] -= dtMs;
      if(state.powerTimers[k] <= 0){
        state.powerTimers[k] = 0;
        if(k==='shield') state.player.shield = false;
      }
    }
  }

  // global speed multiplier
  const speedMul = state.powerTimers.speed>0 ? 1.9 : 1.0;
  // update enemies
  for(let i=state.enemies.length-1;i>=0;i--){
    const e = state.enemies[i];
    e.y += (e.speed + cfg.baseSpeed*0.2) * (dt/16) * speedMul;
    // off-screen cleanup
    if(e.y > cfg.height + 200) state.enemies.splice(i,1);
  }
  // powerups movement
  for(let i=state.powerups.length-1;i>=0;i--){
    const p = state.powerups[i];
    p.y += (cfg.baseSpeed + 1) * (dt/16) * speedMul;
    if(p.y > cfg.height + 200) state.powerups.splice(i,1);
  }

  // bullets
  for(let bi=state.bullets.length-1; bi>=0; bi--){
    const b = state.bullets[bi];
    b.y += b.vy * (dt/16);
    // bullet-enemy collision
    for(let ei=state.enemies.length-1; ei>=0; ei--){
      const e = state.enemies[ei];
      const dx = Math.abs(b.x - e.x); const dy = Math.abs(b.y - e.y);
      if(dx < (e.w/2 + b.r) && dy < (e.h/2 + b.r)){
        // hit
        spawnExplosion(e.x, e.y, '#ff9a5a', 18);
        sfx('explode');
        state.enemies.splice(ei,1);
        state.bullets.splice(bi,1);
        state.score += 12;
        state.scoreProgress = Math.min(1, state.score / 1000);
        break;
      }
    }
    if(b && b.y < -40) state.bullets.splice(bi,1);
  }

  // particles
  for(let i=state.particles.length-1;i>=0;i--){
    const p = state.particles[i];
    p.x += p.vx * (dt/16); p.y += p.vy * (dt/16); p.vy += 0.25 * (dt/16);
    p.life -= dt;
    if(p.life <= 0) state.particles.splice(i,1);
  }

  // collisions: player <-> enemies
  for(let i=state.enemies.length-1;i>=0;i--){
    const e = state.enemies[i];
    const dx = Math.abs(e.x - state.player.x); const dy = Math.abs(e.y - state.player.y);
    if(dx < (e.w/2 + state.player.w/2 - 6) && dy < (e.h/2 + state.player.h/2 - 20)){
      // collision happened
      if(state.player.shield || state.powerTimers.shield>0){
        // consume shield
        state.player.shield = false; state.powerTimers.shield = 0;
        spawnExplosion(e.x,e.y,'#ff7adb',12);
        sfx('shield');
        state.enemies.splice(i,1);
        state.score += 8;
      } else {
        // lose 1 life
        state.lives -= 1;
        spawnExplosion(e.x,e.y,'#ff7a7a',12);
        sfx('crash');
        state.enemies.splice(i,1);
        if(state.lives <= 0){ endGame(); return; }
      }
    }
  }

  // powerup pickups
  for(let i=state.powerups.length-1;i>=0;i--){
    const p = state.powerups[i];
    const dx = Math.abs(p.x - state.player.x); const dy = Math.abs(p.y - state.player.y);
    if(dx < 36 && dy < 64){
      // apply power
      if(p.type === 'speed'){ state.powerTimers.speed = cfg.durations.speed; showTag("Let's speed", '#ffd24a', '#000'); }
      if(p.type === 'blind'){ state.powerTimers.blind = cfg.durations.blind; showTag("Everything is not a gift", '#000', '#fff'); }
      if(p.type === 'gun'){ state.powerTimers.gun = cfg.durations.gun; showTag("No stopping now", '#23ff6b', '#001'); }
      if(p.type === 'shield'){ state.powerTimers.shield = cfg.durations.shield; state.player.shield = true; showTag("Protected", '#ff3fbf', '#fff'); }
      sfx('pickup'); state.powerups.splice(i,1);
      state.score += 10; state.scoreProgress = Math.min(1, state.score / 1000);
    }
  }

  // auto-fire if gun active
  if(state.powerTimers.gun > 0){
    if(state.player.shootCd <= 0){ tryShoot(); }
  }
  if(state.player.shootCd > 0) state.player.shootCd -= dt;

  // scoring over time
  state.score += 0.06 * (dt/16) * (1 + (state.powerTimers.speed>0 ? 0.6 : 0));
  state.scoreProgress = Math.min(1, state.score / 1000);

  // update HUD
  updateHUD();

  draw();
  requestAnimationFrame(loop);
}

// DRAW
let backdropOffset = 0;
function draw(){
  // shake offset
  let sx = 0, sy = 0;
  if(shakeAmt > 0){ sx = rand(-shakeAmt, shakeAmt); sy = rand(-shakeAmt, shakeAmt); shakeAmt *= 0.9; if(shakeAmt < 0.1) shakeAmt = 0; }
  ctx.save();
  ctx.clearRect(0,0,cfg.width,cfg.height);
  ctx.translate(sx,sy);

  // background
  if(state.powerTimers.blind > 0){
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,cfg.width,cfg.height);
  } else {
    const g = ctx.createLinearGradient(0,0,0,cfg.height);
    g.addColorStop(0,'#04020b'); g.addColorStop(1,'#000000');
    ctx.fillStyle = g; ctx.fillRect(0,0,cfg.width,cfg.height);
  }

  // backdrop neon vertical lines (parallax)
  backdropOffset += 2 * (state.powerTimers.speed>0 ? 1.6 : 1);
  for(let i=0;i<12;i++){
    const px = 24 + i * 60;
    const y = (backdropOffset * (0.4 + (i%3)*0.2) + i*130) % (cfg.height + 300) - 300;
    ctx.fillStyle = state.powerTimers.blind>0 ? 'rgba(255,30,30,0.04)' : 'rgba(120,20,255,0.06)';
    ctx.fillRect(px, y, 6, 160);
    ctx.fillRect(cfg.width-px, y+40, 6, 120);
  }

  // road
  drawRoad();

  // powerups
  for(const p of state.powerups) drawPowerup(p);

  // enemies
  for(const e of state.enemies) drawEnemy(e);

  // player
  drawPlayer(state.player);

  // bullets
  for(const b of state.bullets) drawBullet(b);

  // particles
  for(const p of state.particles) drawParticle(p);

  // HUD: power timers
  drawPowerHUD();

  ctx.restore();
}

function drawRoad(){
  const roadW = cfg.width - 120; const rx = 60;
  // road base
  ctx.save();
  ctx.fillStyle = '#06060a';
  roundRect(rx, 0, roadW, cfg.height, 16, true, false);

  // lane dashed lines (glow)
  const laneW = roadW / cfg.lanes;
  for(let i=1;i<cfg.lanes;i++){
    const x = rx + laneW * i;
    for(let y=-400; y < cfg.height + 200; y += 56){
      const off = (y + backdropOffset * 1.2) % 120;
      ctx.fillStyle = state.powerTimers.blind>0 ? 'rgba(255,40,40,0.9)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x-4, y + off, 8, 28);
      ctx.shadowBlur = 18; ctx.shadowColor = state.powerTimers.blind>0 ? '#ff3030' : 'rgba(0,240,255,0.06)';
      ctx.fillRect(x-12, y + off + 48, 120, 0);
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
}

function drawPlayer(p){
  if(!p) return;
  ctx.save();
  // glow
  ctx.shadowBlur = 20;
  ctx.shadowColor = state.powerTimers.blind>0 ? '#ff3939' : '#00f0ff';
  ctx.fillStyle = state.powerTimers.blind>0 ? '#ff4c4c' : '#00f0ff';
  roundRect(p.x - p.w/2, p.y - p.h/2, p.w, p.h, 10, true, false);
  // windows
  ctx.fillStyle = state.powerTimers.blind>0 ? '#440000' : '#001426';
  ctx.fillRect(p.x - p.w/2 + 8, p.y - p.h/2 + 12, p.w-16, 18);

  // turret when gun active
  if(state.powerTimers.gun > 0){
    ctx.fillStyle = '#000'; ctx.fillRect(p.x - 6, p.y - p.h/2 - 12, 12, 10);
    ctx.fillStyle = '#23ff6b'; ctx.fillRect(p.x - 4, p.y - p.h/2 - 10, 8, 6);
  }

  // shield glow (pink)
  if(state.player.shield || state.powerTimers.shield > 0){
    ctx.shadowBlur = 30; ctx.shadowColor = '#ff3fbf';
    ctx.strokeStyle = 'rgba(255,63,191,0.9)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 8, p.w/1.2, p.h/1.6, 0, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // headlights during night
  if(isNight){
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(255,230,120,0.12)';
    ctx.beginPath(); ctx.ellipse(p.x-12, p.y + 12, 60, 120, Math.PI/8, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(p.x+12, p.y + 12, 60, 120, -Math.PI/8, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawEnemy(e){
  ctx.save();
  ctx.shadowBlur = 22;
  ctx.shadowColor = state.powerTimers.blind>0 ? '#ff3030' : e.color;
  ctx.fillStyle = state.powerTimers.blind>0 ? '#ff3b3b' : e.color;
  // draw different shapes to look cool
  if(e.w > 80){ // wide tank
    roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 10, true, false);
    ctx.fillStyle = '#111'; ctx.fillRect(e.x - 14, e.y - 6, 28, 12);
  } else if(e.h > 100){ // tall (truck)
    roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 8, true, false);
    ctx.fillStyle = '#000'; ctx.fillRect(e.x - e.w/2 + 6, e.y - e.h/2 + 8, e.w-12, 18);
  } else {
    // sleek racer
    roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 8, true, false);
    ctx.fillStyle = '#111'; ctx.fillRect(e.x - e.w/2 + 6, e.y - e.h/2 + 10, e.w-12, 12);
  }
  ctx.restore();
}

function drawPowerup(p){
  ctx.save();
  ctx.shadowBlur = 20;
  if(p.type === 'speed'){ ctx.shadowColor = '#ffd24a'; }
  if(p.type === 'blind'){ ctx.shadowColor = '#000000'; }
  if(p.type === 'gun'){ ctx.shadowColor = '#23ff6b'; }
  if(p.type === 'shield'){ ctx.shadowColor = '#ff3fbf'; }
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.w/2, 0, Math.PI*2); ctx.fill();

  // symbol
  ctx.fillStyle = p.type === 'blind' ? '#fff' : '#000';
  ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const sym = p.type === 'speed' ? '⚡' : p.type === 'blind' ? '■' : p.type === 'gun' ? '▸' : '★';
  ctx.fillText(sym, p.x, p.y);
  ctx.restore();
}

function drawBullet(b){
  ctx.save(); ctx.fillStyle = '#ffed9a'; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); ctx.restore();
}

function drawParticle(p){
  ctx.save(); ctx.globalAlpha = Math.max(0, p.life/900); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.restore();
}

function drawPowerHUD(){
  const startX = 14; let y = 16;
  const keys = { speed:'#ffd24a', blind:'#000', gun:'#23ff6b', shield:'#ff3fbf' };
  ctx.save();
  for(const k of ['speed','blind','gun','shield']){
    if(state.powerTimers[k] > 0){
      const full = cfg.durations[k === 'gun' ? 'gun' : k];
      const pct = Math.max(0, Math.min(1, state.powerTimers[k] / (k==='gun' ? cfg.durations.gun : cfg.durations[k])));
      ctx.fillStyle = keys[k];
      ctx.fillRect(startX, y, 140*pct, 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.strokeRect(startX, y, 140, 10);
      y += 16;
    }
  }
  // night indicator
  ctx.fillStyle = isNight ? 'rgba(255,230,120,0.95)' : 'rgba(255,255,255,0.06)';
  ctx.fillRect(cfg.width - 92, 14, 76, 18);
  ctx.fillStyle = isNight ? '#000' : '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign='center';
  ctx.fillText(isNight ? 'NIGHT' : 'DAY', cfg.width - 54, 26);
  ctx.restore();
}

// HELPER roundRect
function roundRect(x,y,w,h,r,fill,stroke){ if(!r) r=6; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

// initial seeding
for(let i=0;i<3;i++) spawnEnemy();
spawnPowerup();
updateHUD(); draw();

// Expose start for debug
window._start = start;
