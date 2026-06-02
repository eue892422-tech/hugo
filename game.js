const gameEl = document.getElementById('game');
const roadEl = document.getElementById('road');
const obstaclesEl = document.getElementById('obstacles');
const fxLayerEl = document.getElementById('fx-layer');
const playerEl = document.getElementById('player');
const chaserEl = document.getElementById('chaser');
const smokeEl = document.getElementById('smoke');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const finalTextEl = document.getElementById('final-text');

const startScreenEl = document.getElementById('start-screen');
const gameOverScreenEl = document.getElementById('game-over-screen');
const startBtnEl = document.getElementById('start-btn');
const restartBtnEl = document.getElementById('restart-btn');

const hugoImg = document.getElementById('hugo-img');
const edineiImg = document.getElementById('edinei-img');

const voicePaths = ['assets/fala1.mp3', 'assets/fala2.mp3', 'assets/fala3.mp3'];
const flyingAssetPaths = ['assets/voando1.png', 'assets/voando2.png', 'assets/voando3.png'];

const voices = voicePaths.map((src) => {
  const audio = new Audio(src);
  audio.preload = 'auto';
  return audio;
});

const OBSTACLE_TYPES = ['crate', 'barrel', 'cone', 'wall'];
const LANES = [-1, 0, 1];

const state = {
  running: false,
  finished: false,
  score: 0,
  best: Number(localStorage.getItem('hugoRunBest') || 0),
  lane: 0,
  laneVisual: 0,
  chaserLaneVisual: 0,
  jumping: false,
  jumpStart: 0,
  jumpDuration: 700,
  speed: 1,
  roadOffset: 0,
  spawnTimer: 0,
  nextSpawn: 900,
  obstacles: [],
  fx: [],
  caught: false,
  catchStart: 0,
  audioDone: false,
  fxDone: false,
  obstaclesClearedOnCatch: false,
  lastTime: 0,
  size: {
    w: 0,
    h: 0,
  },
  input: {
    startX: 0,
    startY: 0,
    active: false,
  }
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function updateBestUI() {
  bestEl.textContent = Math.floor(state.best);
}

function resizeGame() {
  const rect = gameEl.getBoundingClientRect();
  state.size.w = rect.width;
  state.size.h = rect.height;
}

function laneX(lane, depth = 1) {
  const d = clamp(depth, 0, 1);
  const gap = state.size.w * (0.08 + d * 0.18);
  return state.size.w / 2 + lane * gap;
}

function setCharacterAssetBehavior(img, container) {
  const applyLoadedState = () => {
    if (img.naturalWidth > 0) {
      container.classList.add('has-asset');
    }
  };

  img.addEventListener('load', applyLoadedState);
  img.addEventListener('error', () => {
    container.classList.remove('has-asset');
  });

  if (img.complete && img.naturalWidth > 0) {
    applyLoadedState();
  }
}

setCharacterAssetBehavior(hugoImg, playerEl);
setCharacterAssetBehavior(edineiImg, chaserEl);

function preloadAudio() {
  voices.forEach((audio) => {
    try {
      audio.load();
    } catch (e) {}
  });
}

function unlockAudio() {
  voices.forEach((audio) => {
    try {
      audio.muted = true;
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }).catch(() => {
          audio.muted = false;
        });
      } else {
        audio.muted = false;
      }
    } catch (e) {}
  });
}

function playRandomVoice() {
  const chosen = voices[randInt(0, voices.length - 1)];

  voices.forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (e) {}
  });

  try {
    chosen.currentTime = 0;
    chosen.play().catch(() => {});
  } catch (e) {}
}

function currentJumpHeight(now) {
  if (!state.jumping) return 0;

  const t = (now - state.jumpStart) / state.jumpDuration;
  if (t >= 1) {
    state.jumping = false;
    return 0;
  }

  return Math.sin(Math.PI * t) * state.size.h * 0.12;
}

function createObstacleElement(type) {
  const el = document.createElement('div');
  el.className = `obstacle ${type}`;

  if (type === 'crate') {
    const a = document.createElement('div');
    const b = document.createElement('div');
    a.className = 'cross a';
    b.className = 'cross b';
    el.appendChild(a);
    el.appendChild(b);
  }

  if (type === 'barrel') {
    const top = document.createElement('div');
    const bottom = document.createElement('div');
    top.className = 'band top';
    bottom.className = 'band bottom';
    el.appendChild(top);
    el.appendChild(bottom);
  }

  if (type === 'cone') {
    const stripe = document.createElement('div');
    stripe.className = 'stripe';
    el.appendChild(stripe);
  }

  if (type === 'wall') {
    const warn = document.createElement('div');
    warn.className = 'warn';
    el.appendChild(warn);
  }

  return el;
}

function spawnObstacle() {
  const type = OBSTACLE_TYPES[randInt(0, OBSTACLE_TYPES.length - 1)];
  const lane = LANES[randInt(0, LANES.length - 1)];
  const el = createObstacleElement(type);
  obstaclesEl.appendChild(el);

  state.obstacles.push({
    lane,
    type,
    z: 0.02,
    el,
    passed: false,
    hit: false,
  });
}

function renderObstacle(obstacle) {
  const z = obstacle.z;
  const scale = lerp(0.35, 1.4, z);
  const x = laneX(obstacle.lane, z);
  const y = lerp(state.size.h * 0.23, state.size.h * 0.9, Math.pow(z, 1.45));

  obstacle.el.style.left = `${x}px`;
  obstacle.el.style.top = `${y}px`;
  obstacle.el.style.transform = `translate(-50%, -100%) scale(${scale})`;
  obstacle.el.style.zIndex = `${8 + Math.floor(z * 20)}`;
}

function clearObstacles() {
  state.obstacles.forEach((obs) => {
    if (obs.el && obs.el.parentNode) {
      obs.el.parentNode.removeChild(obs.el);
    }
  });
  state.obstacles = [];
}

function clearFx() {
  state.fx.forEach((fx) => {
    if (fx.el && fx.el.parentNode) {
      fx.el.parentNode.removeChild(fx.el);
    }
  });
  state.fx = [];
}

function resetGame() {
  state.running = false;
  state.finished = false;
  state.score = 0;
  state.lane = 0;
  state.laneVisual = 0;
  state.chaserLaneVisual = 0;
  state.jumping = false;
  state.jumpStart = 0;
  state.speed = 1;
  state.roadOffset = 0;
  state.spawnTimer = 0;
  state.nextSpawn = 900;
  state.caught = false;
  state.catchStart = 0;
  state.audioDone = false;
  state.fxDone = false;
  state.obstaclesClearedOnCatch = false;

  scoreEl.textContent = '0';
  finalTextEl.textContent = 'Pontuação: 0';

  clearObstacles();
  clearFx();

  smokeEl.classList.remove('active');
  playerEl.style.opacity = '1';
  chaserEl.style.opacity = '1';
  gameEl.classList.remove('shake');

  resizeGame();
  renderCharacters(performance.now());
  renderRoad(0);
}

function startGame() {
  unlockAudio();
  resetGame();
  startScreenEl.classList.remove('show');
  gameOverScreenEl.classList.remove('show');
  state.running = true;
  state.lastTime = performance.now();
}

function endGame() {
  state.finished = true;
  state.running = false;

  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('hugoRunBest', String(state.best));
    updateBestUI();
  }

  finalTextEl.textContent = `Pontuação: ${Math.floor(state.score)}`;
  gameOverScreenEl.classList.add('show');
}

function jump(now) {
  if (!state.running || state.caught || state.jumping) return;
  state.jumping = true;
  state.jumpStart = now;
}

function moveLane(dir) {
  if (!state.running || state.caught) return;
  state.lane = clamp(state.lane + dir, -1, 1);
}

function renderRoad(dt) {
  const speedFactor = state.running ? state.speed : 0.42;
  state.roadOffset += dt * 0.25 * speedFactor;
  roadEl.style.backgroundPosition = `center ${state.roadOffset}px`;
}

function maybeSpawn(dt) {
  if (!state.running || state.caught) return;

  state.spawnTimer += dt;
  if (state.spawnTimer >= state.nextSpawn) {
    spawnObstacle();
    state.spawnTimer = 0;

    const base = rand(580, 980);
    const reduction = state.speed * 95;
    state.nextSpawn = clamp(base - reduction, 360, 1000);

    if (Math.random() < 0.12 && state.speed > 1.35) {
      setTimeout(() => {
        if (state.running && !state.caught) spawnObstacle();
      }, 120);
    }
  }
}

function triggerCatch(now) {
  if (state.caught || state.finished) return;

  state.caught = true;
  state.running = false;
  state.catchStart = now;
  state.audioDone = false;
  state.fxDone = false;
  state.obstaclesClearedOnCatch = false;

  gameEl.classList.add('shake');
  setTimeout(() => gameEl.classList.remove('shake'), 420);
}

function spawnFlyingObjects() {
  const centerX = laneX(state.laneVisual, 1);
  const centerY = state.size.h * 0.77;

  for (let i = 0; i < 9; i += 1) {
    const el = document.createElement('div');
    el.className = 'flying-thing fallback';

    const img = document.createElement('img');
    img.src = flyingAssetPaths[randInt(0, flyingAssetPaths.length - 1)];
    img.alt = 'objeto voando';

    img.addEventListener('load', () => {
      if (img.naturalWidth > 0) {
        el.classList.add('has-asset');
        el.classList.remove('fallback');
      }
    });

    img.addEventListener('error', () => {
      el.classList.remove('has-asset');
      el.classList.add('fallback');
    });

    el.appendChild(img);
    fxLayerEl.appendChild(el);

    state.fx.push({
      el,
      x: centerX + rand(-18, 18),
      y: centerY + rand(-10, 10),
      vx: rand(-0.42, 0.42),
      vy: rand(-0.8, -0.32),
      gravity: 0.00125,
      rot: rand(0, 360),
      vr: rand(-0.7, 0.7),
      age: 0,
      life: rand(680, 1050),
      size: rand(34, 54),
    });
  }

  smokeEl.style.left = `${centerX}px`;
  smokeEl.style.top = `${centerY - 10}px`;
  smokeEl.classList.remove('active');
  void smokeEl.offsetWidth;
  smokeEl.classList.add('active');
}

function updateCatchSequence(now) {
  if (!state.caught || state.finished) return;

  const elapsed = now - state.catchStart;
  const progress = clamp(elapsed / 650, 0, 1);

  if (progress > 0.32 && !state.audioDone) {
    state.audioDone = true;
    playRandomVoice();
  }

  if (progress > 0.56 && !state.fxDone) {
    state.fxDone = true;
    spawnFlyingObjects();
  }

  if (progress > 0.62 && !state.obstaclesClearedOnCatch) {
    state.obstaclesClearedOnCatch = true;
    clearObstacles();
  }

  if (progress > 0.68) {
    playerEl.style.opacity = '0';
    chaserEl.style.opacity = '0';
  }

  if (elapsed > 1600) {
    endGame();
  }
}

function updateFx(dt) {
  for (let i = state.fx.length - 1; i >= 0; i -= 1) {
    const fx = state.fx[i];
    fx.age += dt;
    fx.x += fx.vx * dt;
    fx.y += fx.vy * dt;
    fx.vy += fx.gravity * dt;
    fx.rot += fx.vr * dt;

    const alpha = clamp(1 - fx.age / fx.life, 0, 1);
    const scale = lerp(0.85, 1.18, fx.age / fx.life);

    fx.el.style.left = `${fx.x}px`;
    fx.el.style.top = `${fx.y}px`;
    fx.el.style.width = `${fx.size}px`;
    fx.el.style.height = `${fx.size}px`;
    fx.el.style.opacity = alpha.toFixed(3);
    fx.el.style.transform = `translate(-50%, -50%) rotate(${fx.rot}deg) scale(${scale})`;

    if (fx.age >= fx.life) {
      if (fx.el.parentNode) {
        fx.el.parentNode.removeChild(fx.el);
      }
      state.fx.splice(i, 1);
    }
  }
}

function updateObstacles(dt, now) {
  const jumpHeight = currentJumpHeight(now);
  const moveSpeed = state.caught ? 0.0006 : 0.00105 * state.speed;

  for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
    const obs = state.obstacles[i];
    obs.z += dt * moveSpeed;
    renderObstacle(obs);

    const sameLane = obs.lane === state.lane;
    const inHitZone = obs.z > 0.82 && obs.z < 1.02;
    const jumpSafe = jumpHeight > state.size.h * 0.065;

    if (!state.caught && !obs.hit && sameLane && inHitZone && !jumpSafe) {
      obs.hit = true;
      triggerCatch(now);
    }

    if (!obs.passed && !obs.hit && obs.z > 1.03) {
      obs.passed = true;
      state.score += 10;
      scoreEl.textContent = `${Math.floor(state.score)}`;
    }

    if (obs.z > 1.24 || state.obstaclesClearedOnCatch) {
      if (obs.el.parentNode) {
        obs.el.parentNode.removeChild(obs.el);
      }
      state.obstacles.splice(i, 1);
    }
  }
}

function renderCharacters(now) {
  const jumpHeight = currentJumpHeight(now);

  state.laneVisual = lerp(state.laneVisual, state.lane, 0.18);
  state.chaserLaneVisual = lerp(state.chaserLaneVisual, state.lane, state.caught ? 0.22 : 0.08);

  const playerX = laneX(state.laneVisual, 1);
  const playerY = state.size.h * 0.86 - jumpHeight;
  playerEl.style.left = `${playerX}px`;
  playerEl.style.top = `${playerY}px`;
  playerEl.style.zIndex = '25';

  const jumpScale = 1 + (jumpHeight / Math.max(1, state.size.h * 0.12)) * 0.05;
  playerEl.style.transform = `translate(-50%, -100%) scale(${jumpScale})`;

  if (!state.caught) {
    const chaserX = laneX(state.chaserLaneVisual, 0.94);
    const chaserY = state.size.h * 0.93;
    chaserEl.style.left = `${chaserX}px`;
    chaserEl.style.top = `${chaserY}px`;
    chaserEl.style.transform = 'translate(-50%, -100%) scale(0.92)';
    chaserEl.style.zIndex = '18';
  } else {
    const p = clamp((now - state.catchStart) / 650, 0, 1);
    const startX = laneX(state.chaserLaneVisual, 0.94);
    const startY = state.size.h * 0.93;
    const endX = laneX(state.laneVisual, 1);
    const endY = state.size.h * 0.87 - jumpHeight * 0.12;

    chaserEl.style.left = `${lerp(startX, endX, p)}px`;
    chaserEl.style.top = `${lerp(startY, endY, p)}px`;
    chaserEl.style.transform = `translate(-50%, -100%) scale(${lerp(0.92, 1.03, p)})`;
    chaserEl.style.zIndex = '26';
  }
}

function gameLoop(now) {
  if (!state.lastTime) {
    state.lastTime = now;
  }

  const dt = Math.min(32, now - state.lastTime);
  state.lastTime = now;

  if (state.running && !state.caught) {
    state.speed = Math.min(2.35, state.speed + dt * 0.000028);
    state.score += dt * 0.012 * state.speed;
    scoreEl.textContent = `${Math.floor(state.score)}`;
  }

  renderRoad(dt);
  maybeSpawn(dt);
  updateObstacles(dt, now);
  updateCatchSequence(now);
  updateFx(dt);
  renderCharacters(now);

  requestAnimationFrame(gameLoop);
}

function handleSwipe(dx, dy) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const threshold = 24;

  if (absX < threshold && absY < threshold) return;

  if (absY > absX && dy < -threshold) {
    jump(performance.now());
    return;
  }

  if (absX > absY) {
    if (dx < -threshold) moveLane(-1);
    if (dx > threshold) moveLane(1);
  }
}

function onPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  state.input.active = true;
  state.input.startX = e.clientX;
  state.input.startY = e.clientY;
}

function onPointerUp(e) {
  if (!state.input.active) return;
  state.input.active = false;
  handleSwipe(e.clientX - state.input.startX, e.clientY - state.input.startY);
}

function onPointerCancel() {
  state.input.active = false;
}

function onKeyDown(e) {
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
    moveLane(-1);
  }

  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
    moveLane(1);
  }

  if (e.key === 'ArrowUp' || e.key === ' ' || e.key.toLowerCase() === 'w') {
    e.preventDefault();
    jump(performance.now());
  }
}

startBtnEl.addEventListener('click', startGame);
restartBtnEl.addEventListener('click', startGame);

gameEl.addEventListener('pointerdown', onPointerDown);
gameEl.addEventListener('pointerup', onPointerUp);
gameEl.addEventListener('pointercancel', onPointerCancel);
window.addEventListener('keydown', onKeyDown);
window.addEventListener('resize', resizeGame);

preloadAudio();
resizeGame();
updateBestUI();
renderCharacters(performance.now());
renderRoad(0);
requestAnimationFrame(gameLoop);
