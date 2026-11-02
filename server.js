const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const WORLD_SIZE = 2000;
const SAFE_ZONE_BASE = 900;
const PLAYER_LIMIT = 100;

app.use(express.static(path.join(__dirname, 'public')));

const WEAPONS = {
  rifle: { name: 'Assault Rifle', damage: 18, fireRate: 0.12, recoil: 0.02 },
  shotgun: { name: 'Shotgun', damage: 32, fireRate: 0.65, recoil: 0.08 },
  sniper: { name: 'Sniper', damage: 78, fireRate: 1.1, recoil: 0.15 },
  smg: { name: 'SMG', damage: 13, fireRate: 0.08, recoil: 0.01 },
  pistol: { name: 'Pistol', damage: 20, fireRate: 0.22, recoil: 0.04 },
};

const stormPhases = [
  { radius: 900, dps: 0 },
  { radius: 750, dps: 1 },
  { radius: 600, dps: 2 },
  { radius: 450, dps: 5 },
  { radius: 300, dps: 10 },
  { radius: 180, dps: 25 },
];

let state = {
  players: {},
  bots: [],
  buildings: [],
  chests: [],
  storm: {
    index: 0,
    radius: 900,
    center: { x: 0, z: 0 },
    phaseTimer: 0,
    totalTime: 0,
    nextPhaseAt: 30,
  },
  match: {
    started: false,
    time: 0,
    ended: false,
  },
};

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createPlayer(id, name) {
  return {
    id,
    name,
    x: randomBetween(-850, 850),
    y: 1.5,
    z: randomBetween(-850, 850),
    yaw: randomBetween(0, Math.PI * 2),
    hp: 100,
    shield: 100,
    alive: true,
    kills: 0,
    materials: { wood: 35, brick: 35, metal: 35 },
    inventory: ['rifle', 'shotgun', 'sniper', 'smg', 'pistol'],
    selected: 'rifle',
    isBot: false,
    lastShot: 0,
  };
}

function generateBots(count) {
  const bots = [];
  for (let i = 0; i < count; i += 1) {
    const id = `bot-${i}`;
    bots.push({
      id,
      name: `Bot ${i + 1}`,
      x: randomBetween(-900, 900),
      y: 1.5,
      z: randomBetween(-900, 900),
      yaw: randomBetween(0, Math.PI * 2),
      hp: 100,
      shield: 100,
      alive: true,
      kills: 0,
      materials: { wood: 30, brick: 25, metal: 25 },
      inventory: ['rifle', 'shotgun', 'sniper', 'smg', 'pistol'],
      selected: 'rifle',
      isBot: true,
      lastShot: Math.random() * 2,
      ai: {
        target: null,
        wanderTime: randomBetween(1, 4),
        dir: { x: randomBetween(-1, 1), z: randomBetween(-1, 1) },
      },
    });
  }
  return bots;
}

state.bots = generateBots(100);

function createChest(id, x, z, rarity = 'common') {
  return { id, x, z, rarity, loot: ['weapon', 'shield'] };
}

function generateChests() {
  const chests = [];
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  for (let i = 0; i < 55; i += 1) {
    const rarity = rarities[Math.floor(Math.random() * rarities.length)];
    chests.push(createChest(`chest-${i}`, randomBetween(-920, 920), randomBetween(-920, 920), rarity));
  }
  return chests;
}

state.chests = generateChests();

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function maybeDamageTarget(target, amount) {
  if (!target || !target.alive) return null;

  let remaining = amount;
  if (target.shield > 0) {
    const absorb = Math.min(target.shield, remaining);
    target.shield -= absorb;
    remaining -= absorb;
  }
  if (remaining > 0) {
    target.hp -= remaining;
  }

  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    return 'eliminated';
  }

  return 'hit';
}

function getAliveEntities() {
  const list = [];
  Object.values(state.players).forEach((p) => {
    if (p.alive) list.push(p);
  });
  state.bots.forEach((b) => {
    if (b.alive) list.push(b);
  });
  return list;
}

function updateStorm(delta) {
  if (!state.match.started || state.match.ended) return;

  state.storm.totalTime += delta;
  state.storm.phaseTimer += delta;

  const nextPhase = stormPhases[state.storm.index];
  if (state.storm.totalTime >= state.storm.nextPhaseAt && state.storm.index < stormPhases.length - 1) {
    state.storm.index += 1;
    state.storm.radius = stormPhases[state.storm.index].radius;
    state.storm.nextPhaseAt += 30;
  }

  const activeStorm = stormPhases[state.storm.index];
  const all = getAliveEntities();

  for (const entity of all) {
    const dist = Math.hypot(entity.x - state.storm.center.x, entity.z - state.storm.center.z);
    if (dist > state.storm.radius) {
      maybeDamageTarget(entity, activeStorm.dps * delta * 0.9);
    }
  }
}

function applyBotAI(delta) {
  for (const bot of state.bots) {
    if (!bot.alive) continue;

    const enemies = getAliveEntities().filter((entity) => entity.id !== bot.id && entity.id !== bot.name);
    const nearest = enemies.reduce((closest, entity) => {
      if (!closest) return entity;
      return distance2D(bot, entity) < distance2D(bot, closest) ? entity : closest;
    }, null);

    if (nearest && distance2D(bot, nearest) < 260) {
      bot.ai.target = nearest;
      const angle = Math.atan2(nearest.z - bot.z, nearest.x - bot.x);
      bot.yaw = angle;
      bot.lastShot += delta;
      if (bot.lastShot > 0.8) {
        const targetResult = maybeDamageTarget(nearest, 9 + Math.random() * 10);
        if (targetResult === 'eliminated') {
          bot.kills += 1;
        }
        bot.lastShot = 0;
      }
    } else {
      bot.ai.wanderTime -= delta;
      if (bot.ai.wanderTime <= 0) {
        bot.ai.dir.x = randomBetween(-1, 1);
        bot.ai.dir.z = randomBetween(-1, 1);
        bot.ai.wanderTime = randomBetween(2, 6);
      }
      bot.x += bot.ai.dir.x * 10 * delta;
      bot.z += bot.ai.dir.z * 10 * delta;
      bot.x = clamp(bot.x, -WORLD_SIZE / 2, WORLD_SIZE / 2);
      bot.z = clamp(bot.z, -WORLD_SIZE / 2, WORLD_SIZE / 2);
    }
  }
}

function serializeState() {
  return {
    players: Object.values(state.players),
    bots: state.bots,
    chests: state.chests,
    buildings: state.buildings,
    storm: state.storm,
    match: state.match,
  };
}

function buildMatchState() {
  state.match.started = true;
  state.match.time = 0;
  state.match.ended = false;
  state.storm.index = 0;
  state.storm.radius = 900;
  state.storm.phaseTimer = 0;
  state.storm.totalTime = 0;
  state.storm.nextPhaseAt = 30;

  Object.values(state.players).forEach((player) => {
    player.x = randomBetween(-900, 900);
    player.z = randomBetween(-900, 900);
    player.hp = 100;
    player.shield = 100;
    player.alive = true;
    player.kills = 0;
  });

  state.bots = generateBots(100);
  state.chests = generateChests();
  state.buildings = [];
}

function getPlayerBySocketId(id) {
  return state.players[id];
}

io.on('connection', (socket) => {
  if (Object.keys(state.players).length >= PLAYER_LIMIT) {
    socket.emit('server-full');
    socket.disconnect();
    return;
  }

  const player = createPlayer(socket.id, `Player ${Object.keys(state.players).length + 1}`);
  state.players[socket.id] = player;
  socket.emit('welcome', { id: socket.id, player });
  io.emit('state', serializeState());

  socket.on('input', (payload = {}) => {
    const target = getPlayerBySocketId(socket.id);
    if (!target || !target.alive) return;

    target.x = Number.isFinite(payload.x) ? payload.x : target.x;
    target.z = Number.isFinite(payload.z) ? payload.z : target.z;
    target.yaw = Number.isFinite(payload.yaw) ? payload.yaw : target.yaw;
    target.selected = payload.selected || target.selected;
    target.x = clamp(target.x, -WORLD_SIZE / 2, WORLD_SIZE / 2);
    target.z = clamp(target.z, -WORLD_SIZE / 2, WORLD_SIZE / 2);
  });

  socket.on('fire', (payload = {}) => {
    const shooter = getPlayerBySocketId(socket.id);
    if (!shooter || !shooter.alive) return;

    const weapon = WEAPONS[shooter.selected] || WEAPONS.rifle;
    const targetId = payload.targetId;
    const hitTarget = state.bots.find((b) => b.id === targetId) || Object.values(state.players).find((p) => p.id === targetId);
    if (hitTarget && hitTarget.alive) {
      const result = maybeDamageTarget(hitTarget, weapon.damage);
      if (result === 'eliminated') {
        shooter.kills += 1;
      }
    }
    io.emit('state', serializeState());
  });

  socket.on('build', (payload = {}) => {
    const player = getPlayerBySocketId(socket.id);
    if (!player) return;

    const type = payload.type || 'wall';
    const cost = { wall: 10, floor: 10, ramp: 10, roof: 10 };
    if (player.materials.wood < cost[type] && player.materials.brick < cost[type] && player.materials.metal < cost[type]) {
      return;
    }

    state.buildings.push({
      id: `building-${Date.now()}-${Math.random()}`,
      x: payload.x,
      y: payload.y,
      z: payload.z,
      type,
      hp: 200,
      owner: socket.id,
    });

    player.materials.wood = Math.max(0, player.materials.wood - 10);
    player.materials.brick = Math.max(0, player.materials.brick - 10);
    player.materials.metal = Math.max(0, player.materials.metal - 10);

    io.emit('state', serializeState());
  });

  socket.on('loot', (payload = {}) => {
    const player = getPlayerBySocketId(socket.id);
    if (!player) return;

    const chest = state.chests.find((item) => item.id === payload.chestId);
    if (!chest) return;

    const rarityMap = { common: 5, uncommon: 10, rare: 20, epic: 30, legendary: 40 };
    const reward = rarityMap[chest.rarity] || 10;
    player.materials.wood += reward;
    player.materials.brick += reward;
    player.materials.metal += reward;
    player.shield = clamp(player.shield + 15, 0, 100);

    state.chests = state.chests.filter((item) => item.id !== chest.id);
    io.emit('state', serializeState());
  });

  socket.on('start-match', () => {
    buildMatchState();
    io.emit('state', serializeState());
  });

  socket.on('disconnect', () => {
    delete state.players[socket.id];
    io.emit('state', serializeState());
  });
});

setInterval(() => {
  if (state.match.started && !state.match.ended) {
    state.match.time += 0.1;
    updateStorm(0.1);
    applyBotAI(0.1);
    io.emit('state', serializeState());
  }
}, 100);

server.listen(PORT, () => {
  console.log(`Fortnite-style battle royale MVP server running at http://localhost:${PORT}`);
});
