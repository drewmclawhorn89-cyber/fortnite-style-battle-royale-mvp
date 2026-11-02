const socket = io();

const INVENTORY = ['rifle', 'shotgun', 'sniper', 'smg', 'pistol'];
const WEAPON_META = {
  rifle: { label: 'Assault Rifle', damage: 18 },
  shotgun: { label: 'Shotgun', damage: 32 },
  sniper: { label: 'Sniper', damage: 78 },
  smg: { label: 'SMG', damage: 14 },
  pistol: { label: 'Pistol', damage: 20 },
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9dd7ff);
scene.fog = new THREE.Fog(0x9dd7ff, 150, 1800);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('game-root').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 8000);
camera.position.set(0, 15, 35);

const world = new CANNON.World();
world.gravity.set(0, -28, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 6;

const terrainBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
terrainBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(terrainBody);

const playerState = {
  id: null,
  x: 0,
  y: 1.5,
  z: 0,
  yaw: 0,
  pitch: -0.18,
  velocityX: 0,
  velocityZ: 0,
  hp: 100,
  shield: 100,
  materials: { wood: 35, brick: 35, metal: 35 },
  inventory: [...INVENTORY],
  selected: 'rifle',
  onGround: true,
  sprinting: false,
  crouching: false,
  healthPulse: 0,
};

let gameState = {
  players: [],
  bots: [],
  chests: [],
  buildings: [],
  storm: { radius: 900 },
  match: { started: false, ended: false },
};

let remotePlayerMeshes = new Map();
let botMeshes = new Map();
let chestMeshes = new Map();
let buildPreview = null;
let environmentObjects = [];
let buildMode = false;
let pointerLocked = false;
let miniMapCtx = document.getElementById('minimap-canvas').getContext('2d');
let mapCanvas = document.getElementById('map-canvas');
let mapCtx = mapCanvas.getContext('2d');
let killFeed = document.getElementById('kill-feed');
let lobbyOverlay = document.getElementById('lobby-overlay');
let matchEnd = document.getElementById('match-end');
let resultsText = document.getElementById('results-text');
let startBtn = document.getElementById('start-btn');
let restartBtn = document.getElementById('restart-btn');
let mapScreen = document.getElementById('map-screen');

const keys = {};
const mouse = { dx: 0, dy: 0 };

function addLight() {
  const hemi = new THREE.HemisphereLight(0xdaf7ff, 0x6e9d5d, 1.35);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffefb2, 1.3);
  sun.position.set(300, 500, 200);
  scene.add(sun);
}

function addGround() {
  const groundGeometry = new THREE.PlaneGeometry(2000, 2000, 8, 8);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x52b765, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  const city = new THREE.Mesh(new THREE.BoxGeometry(700, 20, 700), new THREE.MeshStandardMaterial({ color: 0xd3d5d8, roughness: 1 }));
  city.position.set(-600, 8, -600);
  scene.add(city);

  const forest = new THREE.Mesh(new THREE.BoxGeometry(700, 20, 700), new THREE.MeshStandardMaterial({ color: 0x3ba65b, roughness: 1 }));
  forest.position.set(600, 8, 600);
  scene.add(forest);

  const desert = new THREE.Mesh(new THREE.BoxGeometry(700, 20, 700), new THREE.MeshStandardMaterial({ color: 0xe7bf67, roughness: 1 }));
  desert.position.set(600, 8, -600);
  scene.add(desert);

  const snow = new THREE.Mesh(new THREE.BoxGeometry(700, 20, 700), new THREE.MeshStandardMaterial({ color: 0xdfe7f5, roughness: 1 }));
  snow.position.set(-600, 8, 600);
  scene.add(snow);

  const lake = new THREE.Mesh(new THREE.CircleGeometry(170, 32), new THREE.MeshStandardMaterial({ color: 0x66d7ff, roughness: 0.2, metalness: 0 }));
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, 1, 0);
  scene.add(lake);

  environmentObjects.push(city, forest, desert, snow, lake);
}

function addTrees() {
  for (let i = 0; i < 220; i += 1) {
    const x = (Math.random() - 0.5) * 1800;
    const z = (Math.random() - 0.5) * 1800;
    const radius = Math.hypot(x, z);
    if (radius > 850) continue;

    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.9, 5, 6),
      new THREE.MeshStandardMaterial({ color: 0x694a2b, roughness: 1 })
    );
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(2.3, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3fbf5c, roughness: 1 })
    );
    leaves.position.y = 4.5;
    trunk.position.y = 2.5;
    group.add(trunk);
    group.add(leaves);
    group.position.set(x, 0, z);
    scene.add(group);
    environmentObjects.push(group);
  }
}

function addRocks() {
  for (let i = 0; i < 140; i += 1) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(Math.random() * 1.6 + 0.7, 0),
      new THREE.MeshStandardMaterial({ color: 0x7f8a93, roughness: 1 })
    );
    rock.position.set((Math.random() - 0.5) * 1800, 1.5, (Math.random() - 0.5) * 1800);
    rock.scale.set(1, 1.2, 1);
    scene.add(rock);
    environmentObjects.push(rock);
  }
}

function addBuildings() {
  const points = [
    [-700, -700], [-720, -300], [-450, -760], [300, -700], [750, 700], [800, 150], [-150, 850], [-780, 300],
  ];

  for (let i = 0; i < points.length; i += 1) {
    const [x, z] = points[i];
    const width = 70 + Math.random() * 65;
    const height = 55 + Math.random() * 45;
    const depth = 70 + Math.random() * 65;

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random()*0.15, 0.15, 0.7), roughness: 0.85 })
    );
    building.position.set(x, height / 2, z);
    scene.add(building);
    environmentObjects.push(building);
  }
}

function addChests() {
  for (const chest of gameState.chests) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(8, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd670, emissive: 0x5a4500, emissiveIntensity: 0.3 })
    );
    c.position.set(chest.x, 3, chest.z);
    c.userData.id = chest.id;
    scene.add(c);
    chestMeshes.set(chest.id, c);
  }
}

function createPlayerMesh(name, color = 0x50d7ff) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(2.2, 6.5, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
  );
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf7d2b5, roughness: 0.9 })
  );
  head.position.y = 6.2;
  const weapon = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.8 })
  );
  weapon.position.set(1.8, 4.2, 2.5);
  weapon.rotation.x = -0.7;
  group.add(body);
  group.add(head);
  group.add(weapon);
  return group;
}

function syncRemotePlayers() {
  const all = [...gameState.players, ...gameState.bots];

  for (const remote of all) {
    let mesh = remotePlayerMeshes.get(remote.id) || botMeshes.get(remote.id);
    if (!mesh) {
      const isBot = remote.isBot === true;
      mesh = createPlayerMesh(remote.name || 'Bot', isBot ? 0x85ff7a : 0x50d7ff);
      if (isBot) {
        botMeshes.set(remote.id, mesh);
      } else {
        remotePlayerMeshes.set(remote.id, mesh);
      }
      scene.add(mesh);
    }

    mesh.position.set(remote.x, 1.5, remote.z);
    mesh.rotation.y = remote.yaw || 0;
    mesh.visible = remote.alive !== false;
  }

  for (const [id, mesh] of remotePlayerMeshes.entries()) {
    if (!all.some((p) => p.id === id)) {
      scene.remove(mesh);
      remotePlayerMeshes.delete(id);
    }
  }

  for (const [id, mesh] of botMeshes.entries()) {
    if (!all.some((p) => p.id === id)) {
      scene.remove(mesh);
      botMeshes.delete(id);
    }
  }
}

function syncBuildings() {
  for (const building of gameState.buildings) {
    let mesh = scene.getObjectByName(`building-${building.id}`);
    if (!mesh) {
      const material = new THREE.MeshStandardMaterial({
        color: building.type === 'wall' ? 0xbfb6a8 : building.type === 'floor' ? 0x87b5ff : building.type === 'ramp' ? 0xefb357 : 0x8f9cc9,
      });
      const geometry = new THREE.BoxGeometry(
        building.type === 'wall' ? 12 : 18,
        building.type === 'floor' ? 2 : 12,
        building.type === 'wall' ? 40 : 18
      );
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = `building-${building.id}`;
      scene.add(mesh);
    }
    mesh.position.set(building.x, building.y || 6, building.z);
    mesh.rotation.y = building.rotation || 0;
  }
}

function updateBuildPreview() {
  if (!buildMode) {
    if (buildPreview) {
      scene.remove(buildPreview);
      buildPreview = null;
    }
    return;
  }

  const previewType = 'wall';
  const geometry = new THREE.BoxGeometry(12, 12, 40);
  if (!buildPreview) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x67d0ff,
      transparent: true,
      opacity: 0.45,
      emissive: 0x1e6aad,
      emissiveIntensity: 0.2,
    });
    buildPreview = new THREE.Mesh(geometry, material);
    scene.add(buildPreview);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(environmentObjects, true);

  if (intersections.length > 0) {
    const point = intersections[0].point.clone();
    buildPreview.position.set(Math.round(point.x / 10) * 10, 6, Math.round(point.z / 10) * 10);
    buildPreview.visible = true;
  } else {
    buildPreview.visible = false;
  }
}

function updatePlayerVisual() {
  if (!playerState.id) return;
  const targetPos = new THREE.Vector3(playerState.x, playerState.y, playerState.z);
  camera.position.lerp(new THREE.Vector3(
    playerState.x + Math.sin(playerState.yaw) * -18,
    playerState.y + 10,
    playerState.z + Math.cos(playerState.yaw) * -18
  ), 0.12);
  camera.lookAt(targetPos.x, targetPos.y + 5, targetPos.z);
}

function renderMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = '#0b1e2a';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#9ec7e6';
  ctx.strokeRect(6, 6, size - 12, size - 12);

  const scale = (size - 20) / 2000;
  const px = (playerState.x + 1000) * scale + 10;
  const py = (-playerState.z + 1000) * scale + 10;

  ctx.fillStyle = '#8ce4ff';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();

  for (const bot of gameState.bots) {
    if (!bot.alive) continue;
    const bx = (bot.x + 1000) * scale + 10;
    const by = (-bot.z + 1000) * scale + 10;
    ctx.fillStyle = '#87ff7d';
    ctx.fillRect(bx - 2, by - 2, 4, 4);
  }

  ctx.strokeStyle = '#ffef70';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, (gameState.storm.radius / 2000) * (size - 20), 0, Math.PI * 2);
  ctx.stroke();
}

function renderMapScreen() {
  const ctx = mapCtx;
  const width = mapCanvas.width;
  const height = mapCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#1f3f52';
  ctx.fillRect(0, 0, width, height);

  const scaleX = width / 2000;
  const scaleY = height / 2000;
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.fillStyle = '#9dd7ff';
  ctx.fillRect(centerX - 220, centerY - 220, 440, 440);
  ctx.fillStyle = '#9dc86d';
  ctx.fillRect(centerX - 100, centerY - 100, 200, 200);
  ctx.fillStyle = '#f5c95b';
  ctx.fillRect(centerX + 180, centerY - 150, 140, 130);
  ctx.fillStyle = '#dfe7f5';
  ctx.fillRect(centerX - 150, centerY + 170, 180, 130);

  ctx.fillStyle = '#3cc0ff';
  ctx.fillRect(centerX - 80, centerY - 80, 160, 160);

  for (const player of gameState.players) {
    ctx.fillStyle = '#8de8ff';
    ctx.fillRect(centerX + player.x * scaleX - 3, centerY - player.z * scaleY - 3, 6, 6);
  }

  for (const bot of gameState.bots) {
    if (!bot.alive) continue;
    ctx.fillStyle = '#8bff7d';
    ctx.fillRect(centerX + bot.x * scaleX - 2, centerY - bot.z * scaleY - 2, 4, 4);
  }

  ctx.strokeStyle = '#ffe88d';
  ctx.beginPath();
  ctx.arc(centerX, centerY, (gameState.storm.radius * scaleX), 0, Math.PI * 2);
  ctx.stroke();
}

function updateHud() {
  const hpPercent = Math.max(0, (playerState.hp / 100) * 100);
  const shieldPercent = Math.max(0, (playerState.shield / 100) * 100);

  document.getElementById('hp-fill').style.width = `${hpPercent}%`;
  document.getElementById('shield-fill').style.width = `${shieldPercent}%`;
  document.getElementById('hp-label').textContent = Math.ceil(playerState.hp);
  document.getElementById('shield-label').textContent = Math.ceil(playerState.shield);
  document.getElementById('wood-count').textContent = playerState.materials.wood;
  document.getElementById('brick-count').textContent = playerState.materials.brick;
  document.getElementById('metal-count').textContent = playerState.materials.metal;

  const weaponLabel = WEAPON_META[playerState.selected]?.label || 'Assault Rifle';
  document.getElementById('weapon-name').textContent = weaponLabel;

  const inventoryEl = document.getElementById('inventory');
  inventoryEl.innerHTML = '';
  for (const slot of inventoryEl.children || []) {
    slot.remove();
  }

  for (const weaponName of playerState.inventory) {
    const slot = document.createElement('div');
    slot.className = `slot ${playerState.selected === weaponName ? 'selected' : ''}`;
    slot.textContent = WEAPON_META[weaponName]?.label || weaponName;
    inventoryEl.appendChild(slot);
  }

  const alive = [...gameState.players.filter((p) => p.alive), ...gameState.bots.filter((b) => b.alive)].length;
  document.getElementById('alive-counter').textContent = `${alive} alive`;
}

function pushFeed(text) {
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.textContent = text;
  killFeed.prepend(item);
  while (killFeed.children.length > 6) {
    killFeed.removeChild(killFeed.lastChild);
  }
}

function handlePlayerInput() {
  const speed = keys.Shift ? 38 : 24;
  const moveX = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const moveZ = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);

  if (moveX !== 0 || moveZ !== 0) {
    const len = Math.hypot(moveX, moveZ) || 1;
    const dx = (moveX / len) * speed;
    const dz = (moveZ / len) * speed;
    playerState.x += Math.sin(playerState.yaw) * dx * 0.06;
    playerState.z += Math.cos(playerState.yaw) * dz * 0.06;
  }

  playerState.x = Math.max(-1000, Math.min(1000, playerState.x));
  playerState.z = Math.max(-1000, Math.min(1000, playerState.z));

  const distanceToStorm = Math.hypot(playerState.x, playerState.z);
  if (distanceToStorm > gameState.storm.radius) {
    playerState.hp = Math.max(0, playerState.hp - 1.1);
  }

  socket.emit('input', { x: playerState.x, z: playerState.z, yaw: playerState.yaw, selected: playerState.selected });
}

function fireWeapon() {
  if (!gameState.match.started || !playerState.alive) return;

  const targetCandidate = [...gameState.players.filter((p) => p.id !== playerState.id && p.alive), ...gameState.bots.filter((b) => b.alive)]
    .find((entity) => {
      const dx = entity.x - playerState.x;
      const dz = entity.z - playerState.z;
      const dist = Math.hypot(dx, dz);
      const angleToTarget = Math.atan2(dz, dx);
      const angleDiff = Math.abs(Math.atan2(Math.sin(angleToTarget - playerState.yaw), Math.cos(angleToTarget - playerState.yaw)));
      return dist < 260 && angleDiff < 0.22;
    });

  if (targetCandidate) {
    socket.emit('fire', { targetId: targetCandidate.id });
    if (targetCandidate.isBot) {
      pushFeed(`${WEAPON_META[playerState.selected].label} hit ${targetCandidate.name}`);
    }
  }
}

function changeWeapon(index) {
  playerState.selected = INVENTORY[index] || playerState.selected;
}

function handleKeyDown(event) {
  keys[event.code] = true;

  if (event.code === 'KeyQ') {
    buildMode = !buildMode;
    updateBuildPreview();
  }

  if (event.code === 'KeyM') {
    mapScreen.classList.toggle('visible');
  }

  if (event.code === 'Digit1') changeWeapon(0);
  if (event.code === 'Digit2') changeWeapon(1);
  if (event.code === 'Digit3') changeWeapon(2);
  if (event.code === 'Digit4') changeWeapon(3);
  if (event.code === 'Digit5') changeWeapon(4);

  if (event.code === 'Space' && playerState.onGround) {
    playerState.y += 5.5;
    playerState.onGround = false;
  }

  if (event.code === 'KeyC') {
    playerState.crouching = !playerState.crouching;
  }
}

function handleKeyUp(event) {
  keys[event.code] = false;
}

function handlePointerMove(event) {
  if (!pointerLocked) return;
  mouse.dx = event.movementX || 0;
  mouse.dy = event.movementY || 0;
  playerState.yaw -= mouse.dx * 0.0028;
  playerState.pitch = Math.max(-1.1, Math.min(0.7, playerState.pitch - mouse.dy * 0.0014));
}

function lockPointer() {
  pointerLocked = true;
  document.body.requestPointerLock?.();
}

document.addEventListener('click', () => {
  if (!pointerLocked) {
    lockPointer();
    return;
  }

  if (buildMode) {
    const previewPoint = buildPreview?.position;
    if (previewPoint) {
      socket.emit('build', { type: 'wall', x: previewPoint.x, y: previewPoint.y, z: previewPoint.z });
    }
  } else {
    fireWeapon();
  }
});

document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
document.addEventListener('mousemove', handlePointerMove);
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === document.body;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startBtn.addEventListener('click', () => {
  socket.emit('start-match');
  lobbyOverlay.classList.add('hidden');
  gameState.match.started = true;
});

restartBtn.addEventListener('click', () => {
  socket.emit('start-match');
  matchEnd.classList.add('hidden');
  lobbyOverlay.classList.remove('hidden');
});

socket.on('welcome', (payload) => {
  playerState.id = payload.id;
  playerState.x = payload.player.x;
  playerState.z = payload.player.z;
  playerState.materials = payload.player.materials;
  playerState.inventory = payload.player.inventory;
});

socket.on('state', (state) => {
  gameState = state;
  if (playerState.id) {
    const local = state.players.find((p) => p.id === playerState.id) || state.bots.find((b) => b.id === playerState.id);
    if (local) {
      playerState.hp = local.hp;
      playerState.shield = local.shield;
      playerState.materials = local.materials || playerState.materials;
      playerState.inventory = local.inventory || playerState.inventory;
      playerState.selected = local.selected || playerState.selected;
      playerState.x = local.x;
      playerState.z = local.z;
      playerState.yaw = local.yaw;
      playerState.alive = local.alive;
    }
  }

  if (gameState.match.ended && matchEnd.classList.contains('hidden')) {
    resultsText.textContent = 'You survived the storm and won the match.';
    matchEnd.classList.remove('hidden');
  }

  syncRemotePlayers();
  syncBuildings();
  renderMapScreen();
  updateHud();
});

function setupWorld() {
  addLight();
  addGround();
  addTrees();
  addRocks();
  addBuildings();
  addChests();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = 0.016;
  handlePlayerInput();
  updateBuildPreview();
  renderMinimap();
  updatePlayerVisual();
  renderer.render(scene, camera);
}

setupWorld();
animate();
