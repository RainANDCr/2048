"use strict";

const SIZE = 4;
const STORAGE_KEY = "2048-best-score";
const REVIVE_STORAGE_KEY = "2048-revive-usage";
const REVIVE_LIMIT = 5;
// 唯一有效的复活口令；其余输入一律拒绝。
const REVIVE_CODES = ["cr是区"];
let reviveUsage = Object.create(null);
const boardElement = document.getElementById("board");
const scoreElement = document.getElementById("score");
const bestElement = document.getElementById("best");
const overlay = document.getElementById("overlay");
const messageElement = document.getElementById("message");
const continueButton = document.getElementById("continue");
const statusElement = document.getElementById("status");
const reviveButton = document.getElementById("revive");
const reviveDialog = document.getElementById("revive-dialog");
const reviveInput = document.getElementById("revive-code");
const reviveError = document.getElementById("revive-error");
let board, score, won, gameOver, paused;
let best = 0;
let animating = false;
let queuedDirection = null;
let gameVersion = 0;
let activeAnimations = [];

// 浏览器禁用本地存储时，游戏仍可运行。
try {
  const saved = Number(localStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(saved) && saved > 0) best = saved;
} catch (_) {}
reviveUsage = readReviveUsage();

// 次数独立于棋局保存；读取最新记录，避免重开或其他窗口造成次数回退。
function readReviveUsage() {
  let saved = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(REVIVE_STORAGE_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed;
  } catch (_) {}
  const usage = Object.create(null);
  for (const code of REVIVE_CODES) {
    const count = Number.isSafeInteger(saved[code]) && saved[code] >= 0
      ? Math.min(saved[code], REVIVE_LIMIT) : 0;
    usage[code] = Math.max(reviveUsage[code] || 0, count);
  }
  return usage;
}

function addRandomTile() {
  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) empty.push([r, c]);
    }
  }
  if (!empty.length) return;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  board[r][c] = Math.random() < 0.9 ? 2 : 4;
  return [r, c];
}

// 每一行先移除空格，再合并；本次生成的数字不会重复合并。
function mergeLine(line) {
  const sources = line.map((value, index) => ({ value, index })).filter(item => item.value !== 0);
  const numbers = sources.map(item => item.value);
  const result = [];
  const movements = [];
  const mergedIndices = [];
  let gained = 0;
  for (let i = 0; i < numbers.length; i++) {
    const destination = result.length;
    movements.push({ from: sources[i].index, to: destination });
    if (numbers[i] === numbers[i + 1]) {
      movements.push({ from: sources[i + 1].index, to: destination });
      mergedIndices.push(destination);
      const merged = numbers[i] * 2;
      result.push(merged);
      gained += merged;
      i++;
    } else {
      result.push(numbers[i]);
    }
  }
  while (result.length < SIZE) result.push(0);
  return { line: result, gained, movements, mergedIndices };
}

// 按移动方向读取行或列，统一使用向左的合并规则。
function coordinates(direction, index) {
  return Array.from({ length: SIZE }, (_, offset) => {
    if (direction === "left") return [index, offset];
    if (direction === "right") return [index, SIZE - 1 - offset];
    if (direction === "up") return [offset, index];
    return [SIZE - 1 - offset, index];
  });
}

function canMove() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = board[r][c];
      if (value === 0) return true;
      if (c + 1 < SIZE && value === board[r][c + 1]) return true;
      if (r + 1 < SIZE && value === board[r + 1][c]) return true;
    }
  }
  return false;
}

function render(spawned = [], merged = []) {
  boardElement.classList.remove("sliding");
  boardElement.replaceChildren();
  board.forEach((row, r) => row.forEach((value, c) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.setAttribute("aria-label", `第 ${r + 1} 行第 ${c + 1} 列：${value || "空"}`);
    if (value) {
      cell.textContent = value;
      cell.classList.add(value <= 2048 ? `tile-${value}` : "tile-large");
      const digits = String(value).length;
      if (digits >= 3) cell.classList.add(`digits-${Math.min(digits, 5)}`);
      if (spawned.some(([row, col]) => row === r && col === c)) cell.classList.add("tile-spawn");
      if (merged.some(([row, col]) => row === r && col === c)) cell.classList.add("tile-merge");
    }
    boardElement.appendChild(cell);
  }));
  scoreElement.textContent = score;
  bestElement.textContent = best;
  overlay.hidden = !paused && !gameOver;
  continueButton.hidden = !paused;
  messageElement.textContent = paused ? "你赢了！🎉" : "游戏结束";
  reviveButton.hidden = !gameOver || paused;
  if (!gameOver && reviveDialog.open) reviveDialog.close();
}

function openReviveDialog() {
  if (!gameOver || paused || animating || reviveDialog.open) return;
  reviveInput.value = "";
  reviveInput.removeAttribute("aria-invalid");
  reviveError.textContent = "";
  reviveDialog.showModal();
  reviveInput.focus();
}

function revive(event) {
  event.preventDefault();
  if (!gameOver || paused || animating) return;
  const code = reviveInput.value.trim();
  if (!REVIVE_CODES.includes(code)) {
    reviveError.textContent = "口令不正确，请重试。";
    reviveInput.setAttribute("aria-invalid", "true");
    reviveInput.focus();
    return;
  }
  reviveUsage = readReviveUsage();
  if (reviveUsage[code] >= REVIVE_LIMIT) {
    reviveError.textContent = "该口令已使用 5 次，无法再次复活。";
    reviveInput.setAttribute("aria-invalid", "true");
    reviveInput.focus();
    return;
  }
  const nextUsage = { ...reviveUsage, [code]: reviveUsage[code] + 1 };
  try {
    localStorage.setItem(REVIVE_STORAGE_KEY, JSON.stringify(nextUsage));
  } catch (_) {
    reviveError.textContent = "无法保存复活次数，请允许本地存储后重试。";
    return;
  }
  reviveUsage = nextUsage;
  // 只在成功复活时扣一次额度，每次随机移除两个数字。
  const occupied = [];
  board.forEach((row, r) => row.forEach((value, c) => {
    if (value) occupied.push([r, c]);
  }));
  for (let i = 0; i < 2 && occupied.length; i++) {
    const index = Math.floor(Math.random() * occupied.length);
    const [r, c] = occupied.splice(index, 1)[0];
    board[r][c] = 0;
  }
  gameOver = false;
  queuedDirection = null;
  touchStart = null;
  reviveDialog.close();
  statusElement.textContent = `复活成功！已清空两个格子，分数保留。该口令剩余 ${REVIVE_LIMIT - reviveUsage[code]} 次。`;
  render();
}

// 用临时数字块展示移动，完成后再绘制合并结果。
async function animateMove(movements) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cells = Array.from(boardElement.children);
  const animations = [];
  for (const { from, to } of movements) {
    const source = cells[from[0] * SIZE + from[1]];
    const target = cells[to[0] * SIZE + to[1]];
    // 使用布局位置，避免正在播放的缩放动画影响滑动距离。
    const start = { left: source.offsetLeft, top: source.offsetTop, width: source.offsetWidth, height: source.offsetHeight };
    const end = { left: target.offsetLeft, top: target.offsetTop };
    const tile = source.cloneNode(true);
    tile.classList.remove("tile-spawn", "tile-merge");
    tile.classList.add("moving-tile");
    tile.setAttribute("aria-hidden", "true");
    Object.assign(tile.style, {
      left: `${start.left}px`, top: `${start.top}px`,
      width: `${start.width}px`, height: `${start.height}px`
    });
    boardElement.appendChild(tile);
    const animation = tile.animate([
      { transform: "translate(0, 0)" },
      { transform: `translate(${end.left - start.left}px, ${end.top - start.top}px)` }
    ], { duration: 130, easing: "ease-out", fill: "forwards" });
    animations.push(animation);
  }
  boardElement.classList.add("sliding");
  activeAnimations = animations;
  await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
}

async function move(direction) {
  if (paused || gameOver) return;
  if (animating) { queuedDirection = direction; return; }
  const version = gameVersion;
  const before = JSON.stringify(board);
  let gained = 0;
  const movements = [];
  const mergedCells = [];
  for (let index = 0; index < SIZE; index++) {
    const cells = coordinates(direction, index);
    const merged = mergeLine(cells.map(([r, c]) => board[r][c]));
    merged.movements.forEach(({ from, to }) => movements.push({ from: cells[from], to: cells[to] }));
    merged.mergedIndices.forEach(i => mergedCells.push(cells[i]));
    cells.forEach(([r, c], i) => { board[r][c] = merged.line[i]; });
    gained += merged.gained;
  }
  const changed = JSON.stringify(board) !== before;
  const nextScore = score + gained;
  let spawned;
  if (changed) {
    spawned = addRandomTile();
    statusElement.textContent = gained ? `合并得分 +${gained}` : "继续挑战！";
  }
  gameOver = !canMove();
  if (!won && board.some(row => row.some(value => value >= 2048))) {
    won = true;
    paused = true;
    statusElement.textContent = "达成 2048！可以继续挑战更大的数字。";
  } else if (gameOver) {
    statusElement.textContent = "没有可以移动或合并的数字了。";
  }
  if (changed) {
    animating = true;
    await animateMove(movements);
    // 重开后，旧动画不能覆盖新棋盘。
    if (version !== gameVersion) return;
    activeAnimations.forEach(animation => animation.cancel());
    activeAnimations = [];
    animating = false;
    // 移动完成才提交本局得分。重开取消的旧移动不能更新历史纪录。
    score = nextScore;
    const nextBest = Math.max(best, score);
    if (nextBest !== best) {
      best = nextBest;
      try { localStorage.setItem(STORAGE_KEY, String(best)); } catch (_) {}
    }
  }
  render(spawned ? [spawned] : [], mergedCells);
  const nextDirection = queuedDirection;
  queuedDirection = null;
  if (nextDirection) move(nextDirection);
}

function restart() {
  if (reviveDialog.open) reviveDialog.close();
  gameVersion++;
  activeAnimations.forEach(animation => animation.cancel());
  activeAnimations = [];
  animating = false;
  queuedDirection = null;
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  score = 0;
  won = gameOver = paused = false;
  touchStart = null;
  const spawned = [addRandomTile(), addRandomTile()];
  statusElement.textContent = "使用方向键、WASD 或在棋盘上滑动开始。";
  render(spawned);
}

document.getElementById("restart").addEventListener("click", restart);
document.getElementById("retry").addEventListener("click", restart);
reviveButton.addEventListener("click", openReviveDialog);
document.getElementById("revive-form").addEventListener("submit", revive);
document.getElementById("revive-cancel").addEventListener("click", () => reviveDialog.close());
reviveInput.addEventListener("input", () => {
  reviveInput.removeAttribute("aria-invalid");
  reviveError.textContent = "";
});
continueButton.addEventListener("click", () => {
  paused = false;
  statusElement.textContent = gameOver ? "没有可以移动或合并的数字了。" : "继续挑战更大的数字！";
  render();
});

const keyDirections = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down"
};
document.addEventListener("keydown", event => {
  // 输入口令时，方向键和 WASD 留给输入框使用。
  if (reviveDialog.open || event.target?.closest("input, textarea, select, [contenteditable]")) return;
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  const direction = keyDirections[event.key] || keyDirections[event.key.toLowerCase()];
  if (direction) {
    event.preventDefault();
    move(direction);
  }
});

let touchStart = null;
boardElement.addEventListener("touchstart", event => {
  if (event.touches.length !== 1) { touchStart = null; return; }
  const touch = event.touches[0];
  touchStart = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
}, { passive: true });
boardElement.addEventListener("touchend", event => {
  if (!touchStart) return;
  const touch = Array.from(event.changedTouches).find(item => item.identifier === touchStart.id);
  if (!touch) return;
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
}, { passive: true });
boardElement.addEventListener("touchcancel", () => { touchStart = null; }, { passive: true });

restart();
