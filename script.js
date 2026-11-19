
// ==========================================
// PIXEL SOCCER - MAIN GAME
// ==========================================

// 1. SUPABASE CONNECTION
// Replace these two values with your own Supabase details.

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// 2. HTML ELEMENTS

const screens = {
  menu: document.getElementById("menu-screen"),
  game: document.getElementById("game-screen"),
  leaderboard: document.getElementById("leaderboard-screen"),
  profile: document.getElementById("profile-screen"),
  result: document.getElementById("result-screen")
};

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const playerLabel = document.getElementById("player-label");
const menuPlayerName = document.getElementById("menu-player-name");
const leaderboardList = document.getElementById("leaderboard-list");

// 3. PLAYER DATA

let currentUser = null;
let playerName = "";
let playerRecord = null;

let playerGoals = 0;
let botGoals = 0;
let matchTime = 90;
let matchRunning = false;
let matchSaved = false;
let lastFrame = 0;
let animationId = null;

const keys = {};

const field = {
  width: canvas.width,
  height: canvas.height
};

// 4. GAME OBJECTS

const player = {
  x: 230,
  y: 270,
  radius: 19,
  speed: 3.3,
  facingX: 1,
  facingY: 0,
  color: "#f4d35e"
};

const bot = {
  x: 670,
  y: 270,
  radius: 21,
  speed: 2.05,
  facingX: -1,
  facingY: 0
};

const ball = {
  x: 450,
  y: 270,
  radius: 10,
  vx: 0,
  vy: 0
};

// 5. SCREEN NAVIGATION

function showScreen(screenName) {
  Object.values(screens).forEach(screen => {
    screen.classList.add("hidden");
  });

  screens[screenName].classList.remove("hidden");
}

// 6. AUTOMATIC PLAYER ACCOUNT

function generatePlayerName() {
  return "SoccerPlayer" + Math.floor(10000 + Math.random() * 90000);
}

async function initializePlayer() {
  if (
    SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL" ||
    SUPABASE_KEY === "YOUR_SUPABASE_PUBLISHABLE_KEY"
  ) {
    playerName = "DEMO PLAYER";
    updatePlayerDisplay();
    console.warn("Add your Supabase URL and publishable key to enable online features.");
    return;
  }

  try {
    const { data: authData, error: authError } =
      await db.auth.signInAnonymously();

    if (authError) throw authError;

    currentUser = authData.user;

    await loadOrCreatePlayer();
  } catch (error) {
    console.error("Player account error:", error);
    playerName = "OFFLINE PLAYER";
    updatePlayerDisplay();
  }
}

async function loadOrCreatePlayer() {
  const { data, error } = await db
    .from("leaderboard")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    playerRecord = data;
    playerName = data.display_name;
    updatePlayerDisplay();
    return;
  }

  // Give every new player an automatically generated name.
  for (let attempt = 0; attempt < 10; attempt++) {
    const newName = generatePlayerName();

    const { data: inserted, error: insertError } = await db
      .from("leaderboard")
      .insert({
        user_id: currentUser.id,
        display_name: newName,
        goals_for: 0,
        goals_against: 0,
        matches: 0
      })
      .select()
      .single();

    if (!insertError) {
      playerRecord = inserted;
      playerName = inserted.display_name;
      updatePlayerDisplay();
      return;
    }

    // Retry if the randomly generated name already exists.
    if (insertError.code !== "23505") {
      throw insertError;
    }
  }

  throw new Error("Could not generate a unique player name.");
}

function updatePlayerDisplay() {
  menuPlayerName.textContent = playerName;
  playerLabel.textContent = "PLAYER: " + playerName;
}

// 7. PLAYER NAME CHANGING

document.getElementById("change-name-button").addEventListener("click", () => {
  document.getElementById("name-input").value =
    playerName === "DEMO PLAYER" || playerName === "OFFLINE PLAYER"
      ? ""
      : playerName;

  document.getElementById("profile-message").textContent = "";
  showScreen("profile");
});

document.getElementById("profile-back-button").addEventListener("click", () => {
  showScreen("menu");
});

document.getElementById("save-name-button").addEventListener("click", async () => {
  const input = document.getElementById("name-input");
  const message = document.getElementById("profile-message");
  const newName = input.value.trim();

  if (newName.length < 3 || newName.length > 20) {
    message.textContent = "Your name must be 3–20 characters.";
    return;
  }

  if (!/^[a-zA-Z0-9 _-]+$/.test(newName)) {
    message.textContent = "Use only letters, numbers, spaces, _ or -.";
    return;
  }

  if (!currentUser) {
    message.textContent = "Connect Supabase to save your name online.";
    return;
  }

  message.textContent = "Saving...";

  const { data, error } = await db
    .from("leaderboard")
    .update({ display_name: newName })
    .eq("user_id", currentUser.id)
    .select()
    .single();

  if (error) {
    message.textContent =
      error.code === "23505"
        ? "That name is already taken."
        : "Could not save your name. Try again.";
    console.error(error);
    return;
  }

  playerRecord = data;
  playerName = data.display_name;
  updatePlayerDisplay();
  message.textContent = "Name successfully changed!";

  setTimeout(() => showScreen("menu"), 700);
});

// 8. LEADERBOARD

document.getElementById("leaderboard-button").addEventListener("click", async () => {
  showScreen("leaderboard");
  await loadLeaderboard();
});

document.getElementById("leaderboard-back-button").addEventListener("click", () => {
  showScreen("menu");
});

document.getElementById("refresh-leaderboard-button").addEventListener("click", loadLeaderboard);

async function loadLeaderboard() {
  leaderboardList.innerHTML = "<p>Loading leaderboard...</p>";

  if (!currentUser) {
    leaderboardList.innerHTML =
      "<p>Connect Supabase to see the worldwide leaderboard.</p>";
    return;
  }

  const { data, error } = await db
    .from("leaderboard")
    .select("display_name, goals_for, goals_against, matches, goal_difference")
    .order("goal_difference", { ascending: false })
    .order("goals_for", { ascending: false })
    .order("goals_against", { ascending: true })
    .limit(100);

  if (error) {
    console.error(error);
    leaderboardList.innerHTML = "<p>Could not load leaderboard.</p>";
    return;
  }

  if (!data || data.length === 0) {
    leaderboardList.innerHTML = "<p>No players yet. Be the first!</p>";
    return;
  }

  leaderboardList.innerHTML = "";

  data.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";

    const values = [
      index + 1,
      entry.display_name,
      entry.goals_for,
      entry.goals_against,
      entry.goal_difference,
      entry.matches
    ];

    values.forEach((value, valueIndex) => {
      const cell = document.createElement("span");
      cell.textContent = value;

      if (valueIndex === 1) {
        cell.className = "player-name";
      }

      row.appendChild(cell);
    });

    leaderboardList.appendChild(row);
  });
}

// 9. MATCH SETUP

function resetMatch() {
  playerGoals = 0;
  botGoals = 0;
  matchTime = 90;
  matchRunning = true;
  matchSaved = false;

  player.x = 230;
  player.y = 270;
  player.facingX = 1;
  player.facingY = 0;

  bot.x = 670;
  bot.y = 270;
  bot.facingX = -1;
  bot.facingY = 0;

  resetBall();

  document.getElementById("player-score").textContent = "0";
  document.getElementById("bot-score").textContent = "0";
  document.getElementById("match-clock").textContent = "90";

  lastFrame = 0;
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

function resetBall() {
  ball.x = 450;
  ball.y = 270;
  ball.vx = 0;
  ball.vy = 0;
}

document.getElementById("play-button").addEventListener("click", () => {
  showScreen("game");
  resetMatch();
});

document.getElementById("play-again-button").addEventListener("click", () => {
  showScreen("game");
  resetMatch();
});

document.getElementById("leave-game-button").addEventListener("click", () => {
  matchRunning = false;
  cancelAnimationFrame(animationId);
  showScreen("menu");
});

document.getElementById("result-menu-button").addEventListener("click", () => {
  showScreen("menu");
});

// 10. KEYBOARD CONTROLS

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();

  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)
  ) {
    event.preventDefault();
  }

  keys[key] = true;

  if (key === " " && matchRunning) {
    shootBall(player);
  }
});

window.addEventListener("keyup", event => {
  keys[event.key.toLowerCase()] = false;
});

// 11. PLAYER MOVEMENT

function movePlayer(delta) {
  let dx = 0;
  let dy = 0;

  if (keys["w"] || keys["arrowup"]) dy -= 1;
  if (keys["s"] || keys["arrowdown"]) dy += 1;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;

    player.facingX = dx;
    player.facingY = dy;
  }

  const sprint = keys["shift"] ? 1.35 : 1;
  const speed = player.speed * sprint * delta;

  player.x += dx * speed;
  player.y += dy * speed;

  player.x = Math.max(35, Math.min(865, player.x));
  player.y = Math.max(35, Math.min(505, player.y));
}

// 12. BALL SHOOTING

function shootBall(character) {
  const distance = Math.hypot(
    ball.x - character.x,
    ball.y - character.y
  );

  if (distance < 65) {
    ball.vx = character.facingX * 8;
    ball.vy = character.facingY * 8;
  }
}

// 13. BALL PHYSICS

function updateBall(delta) {
  ball.x += ball.vx * delta;
  ball.y += ball.vy * delta;

  const friction = Math.pow(0.985, delta);
  ball.vx *= friction;
  ball.vy *= friction;

  if (Math.abs(ball.vx) < 0.04) ball.vx = 0;
  if (Math.abs(ball.vy) < 0.04) ball.vy = 0;

  // Bounce off the top and bottom walls.
  if (ball.y < 18 || ball.y > 522) {
    ball.vy *= -0.8;
    ball.y = Math.max(18, Math.min(522, ball.y));
  }

  // Side walls, except inside the goals.
  const inGoal = ball.y > 210 && ball.y < 330;

  if (!inGoal && (ball.x < 18 || ball.x > 882)) {
    ball.vx *= -0.8;
    ball.x = Math.max(18, Math.min(882, ball.x));
  }

  // Goal detection.
  if (ball.x < 8 && inGoal) {
    botGoals++;
    updateScore();
    resetBall();
  }

  if (ball.x > 892 && inGoal) {
    playerGoals++;
    updateScore();
    resetBall();
  }

  // Player-ball contact.
  collideBall(player, 1);

  // Robot-ball contact.
  collideBall(bot, 1);
}

function collideBall(character, power) {
  const dx = ball.x - character.x;
  const dy = ball.y - character.y;
  const distance = Math.hypot(dx, dy);
  const minimum = character.radius + ball.radius;

  if (distance < minimum && distance > 0) {
    const nx = dx / distance;
    const ny = dy / distance;

    ball.x = character.x + nx * minimum;
    ball.y = character.y + ny * minimum;

    ball.vx += nx * 0.7 * power;
    ball.vy += ny * 0.7 * power;
  }
}

// 14. ROBOT AI

function updateBot(delta) {
  const dx = ball.x - bot.x;
  const dy = ball.y - bot.y;
  const distance = Math.hypot(dx, dy);

  if (distance > 0) {
    const nx = dx / distance;
    const ny = dy / distance;

    bot.facingX = nx;
    bot.facingY = ny;

    bot.x += nx * bot.speed * delta;
    bot.y += ny * bot.speed * delta;
  }

  bot.x = Math.max(35, Math.min(865, bot.x));
  bot.y = Math.max(35, Math.min(505, bot.y));

  // The robot tries to shoot toward your goal.
  if (distance < 48 && Math.random() < 0.025 * delta) {
    const targetX = 20 - bot.x;
    const targetY = 270 - bot.y;
    const length = Math.hypot(targetX, targetY);

    if (length > 0) {
      ball.vx = (targetX / length) * 7;
      ball.vy = (targetY / length) * 7;
    }
  }
}

// 15. SCORE AND MATCH ENDING

function updateScore() {
  document.getElementById("player-score").textContent = playerGoals;
  document.getElementById("bot-score").textContent = botGoals;
}

async function endMatch() {
  if (!matchRunning) return;

  matchRunning = false;
  cancelAnimationFrame(animationId);

  document.getElementById("final-player-score").textContent = playerGoals;
  document.getElementById("final-bot-score").textContent = botGoals;

  let title = "DRAW!";
  if (playerGoals > botGoals) title = "YOU WIN!";
  if (playerGoals < botGoals) title = "YOU LOSE!";

  document.getElementById("result-title").textContent = title;
  document.getElementById("result-message").textContent =
    playerName + " vs BOTS";

  showScreen("result");

  await saveMatchStatistics();
}

async function saveMatchStatistics() {
  if (matchSaved) return;
  if (!currentUser || !playerRecord) return;

  const newGoalsFor = playerRecord.goals_for + playerGoals;
  const newGoalsAgainst = playerRecord.goals_against + botGoals;
  const newMatches = playerRecord.matches + 1;

  const { data, error } = await db
    .from("leaderboard")
    .update({
      goals_for: newGoalsFor,
      goals_against: newGoalsAgainst,
      matches: newMatches
    })
    .eq("user_id", currentUser.id)
    .select()
    .single();

  if (error) {
    console.error("Could not save match statistics:", error);
    document.getElementById("result-message").textContent =
      "Match finished, but your statistics could not be saved. Check your connection.";
    return;
  }

  playerRecord = data;
  matchSaved = true;
}

// 16. DRAW THE SOCCER FIELD

function drawField() {
  ctx.fillStyle = "#328b4b";
  ctx.fillRect(0, 0, 900, 540);

  // Alternating grass stripes.
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#328b4b" : "#2d8044";
    ctx.fillRect(i * 100, 0, 100, 540);
  }

  // Field lines.
  ctx.strokeStyle = "white";
  ctx.lineWidth = 4;

  ctx.strokeRect(18, 18, 864, 504);

  ctx.beginPath();
  ctx.moveTo(450, 18);
  ctx.lineTo(450, 522);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(450, 270, 75, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(450, 270, 4, 0, Math.PI * 2);
  ctx.fillStyle = "white";
  ctx.fill();

  // Penalty areas.
  ctx.strokeRect(18, 155, 120, 230);
  ctx.strokeRect(762, 155, 120, 230);

  // Goals.
  ctx.fillStyle = "#dce5ed";
  ctx.fillRect(0, 210, 18, 120);
  ctx.fillRect(882, 210, 18, 120);

  ctx.strokeStyle = "white";
  ctx.strokeRect(0, 210, 18, 120);
  ctx.strokeRect(882, 210, 18, 120);
}

// 17. DRAW THE PLAYER

function drawPlayer() {
  ctx.fillStyle = "#00000055";
  ctx.fillRect(player.x - 15, player.y + 15, 32, 9);

  // Body.
  ctx.fillStyle = "#e9bd37";
  ctx.fillRect(player.x - 14, player.y - 13, 28, 29);

  // Shirt.
  ctx.fillStyle = "#f4d35e";
  ctx.fillRect(player.x - 12, player.y - 11, 24, 19);

  // Head.
  ctx.fillStyle = "#f0c7a2";
  ctx.fillRect(player.x - 9, player.y - 25, 18, 14);

  // Hair.
  ctx.fillStyle = "#55351f";
  ctx.fillRect(player.x - 10, player.y - 27, 20, 6);

  // Direction indicator.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(
    player.x + player.facingX * 17 - 3,
    player.y + player.facingY * 17 - 3,
    6,
    6
  );
}

// 18. DRAW THE ROBOT

function drawBot() {
  ctx.fillStyle = "#00000055";
  ctx.fillRect(bot.x - 17, bot.y + 17, 36, 9);

  // Silver robot head.
  ctx.fillStyle = "#c3ccd5";
  ctx.fillRect(bot.x - 13, bot.y - 26, 26, 22);

  // Robot eyes.
  ctx.fillStyle = "#172338";
  ctx.fillRect(bot.x - 8, bot.y - 19, 5, 5);
  ctx.fillRect(bot.x + 3, bot.y - 19, 5, 5);

  // Blue jersey.
  ctx.fillStyle = "#1765df";
  ctx.fillRect(bot.x - 17, bot.y - 3, 34, 27);

  // Jersey text.
  ctx.fillStyle = "white";
  ctx.font = "bold 9px Courier New";
  ctx.textAlign = "center";
  ctx.fillText("BOTS", bot.x, bot.y + 13);

  // Silver legs.
  ctx.fillStyle = "#aab4c0";
  ctx.fillRect(bot.x - 12, bot.y + 23, 9, 12);
  ctx.fillRect(bot.x + 3, bot.y + 23, 9, 12);
}

// 19. DRAW THE BALL

function drawBall() {
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#172338";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#172338";
  ctx.fillRect(ball.x - 3, ball.y - 3, 6, 6);
}

// 20. GAME LOOP

function gameLoop(timestamp) {
  if (!matchRunning) return;

  if (!lastFrame) lastFrame = timestamp;

  const delta = Math.min((timestamp - lastFrame) / 16.67, 2);
  lastFrame = timestamp;

  drawField();

  movePlayer(delta);
  updateBot(delta);
  updateBall(delta);

  drawPlayer();
  drawBot();
  drawBall();

  animationId = requestAnimationFrame(gameLoop);
}

// 21. MATCH CLOCK

setInterval(() => {
  if (!matchRunning) return;

  matchTime--;
  document.getElementById("match-clock").textContent = matchTime;

  if (matchTime <= 0) {
    endMatch();
  }
}, 1000);

// 22. START THE GAME

initializePlayer();
showScreen("menu");

