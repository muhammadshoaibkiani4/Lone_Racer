const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- Audio setup ---
const bgMusic = document.getElementById("bgMusic");
const engineSound = document.getElementById("engineSound");
const powerUpSound = document.getElementById("powerUpSound");
const shootSound = document.getElementById("shootSound");
const explosionSound = document.getElementById("explosionSound");

// --- Game variables ---
let keys = {};
let score = 0;
let highscore = localStorage.getItem("loneHigh") || 0;
let gameActive = false;
let speed = 6;
let hearts = 3;
let obstacles = [];
let powerUps = [];
let bullets = [];
let night = false;
let shield = false;
let gunMode = false;
let darkMode = false;
let boost = false;
let taglineTimeout;
let trail = [];

// --- Car ---
const car = {
  x: canvas.width / 2 - 25,
  y: canvas.height - 120,
  w: 50,
  h: 90,
  color: "#00ffff"
};

// --- Drawing functions ---
function drawCar() {
  // Trail effect
  trail.push({ x: car.x, y: car.y });
  if (trail.length > 10) trail.shift();
  ctx.save();
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    ctx.globalAlpha = i / trail.length;
    ctx.fillStyle = boost ? "yellow" : "#00ffff";
    ctx.fillRect(t.x, t.y, car.w, car.h);
  }
  ctx.globalAlpha = 1;

  // Headlights (night)
  if (night) {
    ctx.save();
    ctx.beginPath();
    const grd = ctx.createRadialGradient(car.x + car.w / 2, car.y, 10, car.x + car.w / 2, car.y - 200, 300);
    grd.addColorStop(0, "rgba(255,255,100,0.3)");
    grd.addColorStop(1, "rgba(255,255,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(car.x - 100, car.y - 300, 250, 300);
    ctx.restore();
  }

  // Car body
  ctx.shadowBlur = 20;
  ctx.shadowColor = boost ? "#ffff00" : car.color;
  ctx.fillStyle = car.color;
  ctx.fillRect(car.x, car.y, car.w, car.h);

  if (shield) {
    ctx.strokeStyle = "#ff00ff";
    ctx.lineWidth = 5;
    ctx.strokeRect(car.x - 5, car.y - 5, car.w + 10, car.h + 10);
  }

  ctx.restore();
}

// --- Gameplay objects ---
function createObstacle() {
  const w = 40 + Math.random() * 40;
  obstacles.push({
    x: Math.random() * (canvas.width - w),
    y: -100,
    w,
    h: 90,
    color: darkMode ? "#ff0000" : "#ff0080"
  });
}

function createPowerUp() {
  const types = ["boost", "dark", "gun", "shield"];
  const type = types[Math.floor(Math.random() * types.length)];
  powerUps.push({
    x: Math.random() * (canvas.width - 30),
    y: -30,
    w: 30,
    h: 30,
    type
  });
}

// --- Sounds ---
function playSound(sound) {
  if (document.getElementById("musicToggle").checked) {
    sound.currentTime = 0;
    sound.play();
  }
}

// --- Collisions ---
function detectCollisions() {
  obstacles.forEach((o, i) => {
    if (
      car.x < o.x + o.w &&
      car.x + car.w > o.x &&
      car.y < o.y + o.h &&
      car.y + car.h > o.y
    ) {
      if (shield) {
        shield = false;
        playSound(explosionSound);
      } else {
        hearts--;
        playSound(explosionSound);
      }
      obstacles.splice(i, 1);
    }
  });

  powerUps.forEach((p, i) => {
    if (
      car.x < p.x + p.w &&
      car.x + car.w > p.x &&
      car.y < p.y + p.h &&
      car.y + car.h > p.y
    ) {
      activatePowerUp(p.type);
      playSound(powerUpSound);
      powerUps.splice(i, 1);
    }
  });

  bullets.forEach((b, bi) => {
    obstacles.forEach((o, oi) => {
      if (b.x < o.x + o.w && b.x + 5 > o.x && b.y < o.y + o.h && b.y + 10 > o.y) {
        bullets.splice(bi, 1);
        obstacles.splice(oi, 1);
        score += 20;
        playSound(explosionSound);
      }
    });
  });
}

// --- Power-ups ---
function activatePowerUp(type) {
  const tagline = document.getElementById("tagline");
  clearTimeout(taglineTimeout);

  switch (type) {
    case "boost":
      boost = true;
      speed = 10;
      tagline.textContent = "Let's speed!";
      setTimeout(() => {
        boost = false;
        speed = 6;
      }, 10000);
      break;

    case "dark":
      darkMode = true;
      tagline.textContent = "Everything is not a gift.";
      setTimeout(() => (darkMode = false), 8000);
      break;

    case "gun":
      gunMode = true;
      tagline.textContent = "No stopping now!";
      setTimeout(() => (gunMode = false), 10000);
      break;

    case "shield":
      shield = true;
      tagline.textContent = "Shielded up!";
      break;
  }

  taglineTimeout = setTimeout(() => (tagline.textContent = ""), 3000);
}

// --- Draw background ---
function drawBackground() {
  ctx.fillStyle = darkMode ? "#000" : night ? "#040018" : "#0a001a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// --- Game loop ---
function gameLoop() {
  if (!gameActive) return;

  drawBackground();
  moveObjects();
  detectCollisions();
  drawCar();
  drawObstacles();
  drawPowerUps();
  drawBullets();
  drawHearts();
  updateScore();

  if (gunMode && keys[" "]) {
    bullets.push({ x: car.x + car.w / 2 - 2, y: car.y });
    playSound(shootSound);
  }

  if (hearts <= 0) endGame();

  requestAnimationFrame(gameLoop);
}

// --- Start ---
function startGame() {
  if (document.getElementById("musicToggle").checked) bgMusic.play();
  gameActive = true;
  hearts = 3;
  score = 0;
  obstacles = [];
  powerUps = [];
  bullets = [];
  setInterval(createObstacle, 1000);
  setInterval(createPowerUp, 7000);
  setInterval(() => (night = !night), 90000);
  gameLoop();
}

function endGame() {
  gameActive = false;
  document.getElementById("tagline").textContent = "Game Over!";
  bgMusic.pause();
}

// --- Drawing helpers ---
function drawObstacles() { obstacles.forEach(o => { ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y, o.w, o.h); }); }
function drawPowerUps() {
  const colors = { boost: "yellow", dark: "black", gun: "lime", shield: "pink" };
  powerUps.forEach(p => {
    ctx.fillStyle = colors[p.type];
    ctx.beginPath();
    ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 15, 0, Math.PI * 2);
    ctx.fill();
  });
}
function drawBullets() {
  ctx.fillStyle = "red";
  bullets.forEach(b => ctx.fillRect(b.x, b.y, 5, 10));
}
function drawHearts() {
  const heartContainer = document.getElementById("hearts");
  heartContainer.innerHTML = "";
  for (let i = 0; i < hearts; i++) {
    const div = document.createElement("div");
    div.classList.add("heart");
    heartContainer.appendChild(div);
  }
}
function moveObjects() {
  obstacles.forEach(o => o.y += speed);
  powerUps.forEach(p => p.y += speed);
  bullets.forEach(b => b.y -= 10);
  obstacles = obstacles.filter(o => o.y < canvas.height);
  powerUps = powerUps.filter(p => p.y < canvas.height);
  bullets = bullets.filter(b => b.y > 0);
}
function updateScore() {
  score++;
  document.getElementById("score").textContent = score;
  if (score > highscore) {
    highscore = score;
    localStorage.setItem("loneHigh", highscore);
  }
  document.getElementById("highscore").textContent = highscore;
}

// --- Movement ---
window.addEventListener("keydown", e => (keys[e.key] = true));
window.addEventListener("keyup", e => (keys[e.key] = false));
function handleCarMovement() {
  if (keys["ArrowLeft"] && car.x > 0) car.x -= 8;
  if (keys["ArrowRight"] && car.x + car.w < canvas.width) car.x += 8;
  if (keys["ArrowUp"] && car.y > 0) car.y -= 6;
  if (keys["ArrowDown"] && car.y + car.h < canvas.height) car.y += 6;
}
setInterval(handleCarMovement, 16);

document.getElementById("startBtn").onclick = startGame;
document.getElementById("restartBtn").onclick = () => window.location.reload();
window.addEventListener("resize", () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
