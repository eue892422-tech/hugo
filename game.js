const gameEl = document.getElementById("game");
const roadEl = document.getElementById("road");
const obstaclesEl = document.getElementById("obstacles");
const fxLayerEl = document.getElementById("fx-layer");
const playerEl = document.getElementById("player");
const chaserEl = document.getElementById("chaser");
const smokeEl = document.getElementById("smoke");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const finalTextEl = document.getElementById("final-text");

const startScreenEl = document.getElementById("start-screen");
const gameOverScreenEl = document.getElementById("game-over-screen");
const startBtnEl = document.getElementById("start-btn");
const restartBtnEl = document.getElementById("restart-btn");

const hugoImg = document.getElementById("hugo-img");
const edineiImg = document.getElementById("edinei-img");

const voices = [
  new Audio("assets/fala1.mp3"),
  new Audio("assets/fala2.mp3"),
  new Audio("assets/fala3.mp3"),
];

voices.forEach((audio) => {
  audio.preload = "auto";
});

const OBSTACLE_TYPES = ["crate", "barrel", "cone", "wall"];
const LANES = [-1, 0, 1];

const state = {
  running: false,
  finished: false,
  score: 0,
  best: Number(localStorage.getItem("hugoRunBest") || 0),

  lane: 0,
  laneVisual: 0,
  chaserLaneVisual: 0,

  jumping: false,
  jumpStart: 0,
  jumpDuration: 650,

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
    horizon: 0,
    ground: 0,
  },

  input: {
    startX: 0,
    startY: 0,
    active: false,
  },
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

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function updateBestUI() {
  bestEl.textContent = Math.floor(state.best);
}

function resizeGame() {
  const rect = gameEl.getBoundingClientRect();
  state.size.w = rect.width;
  state.size.h = rect.height;
  state.size.horizon = rect.height * 0.18;
  state.size.ground = rect.height * 0.82;
}

function laneX(lane, depth = 1) {
  const depthClamped = clamp(depth, 0, 1);
  const gap = state.size.w * (0.08 + depthClamped * 0.18);
  return state.size.w / 2 + lane * gap;
}

function setCharacterAssetBehavior(img, container) {
  function applyLoadedState() {
    if (img.naturalWidth > 0) {
      container.classList.add("has-asset");
    }
  }

  img.addEventListener("load", applyLoadedState);
  img.addEventListener("error", () => {
    container.classList.remove("has-asset");
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

function playRandomVoice() {
  const index = randInt(0, voices.length - 1);
  const chosen = voices[index];

  voices.forEach((a) => {
    try {
      a.pause();
      a.currentTime = 0;
    } catch (e) {}
  });

  try {
    chosen.currentTime = 0;
    chosen.play().catch(() => {});
  } catch (e) {}
}

function currentJumpHeight(now) {
  if (!state.jumping)
