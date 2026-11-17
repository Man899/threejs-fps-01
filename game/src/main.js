// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. main.js is the only file that knows about every other module — it wires the
// match state machine, the player, the bots, the weapons, the effects and the HUD
// together, resolves every shot, and owns the screenshot modes.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, MAP } from './world.js';
import { createInput } from './input.js';
import { createBody } from './player.js';
import { createWeaponSet, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects, createGrenade } from './effects.js';
import { createHud } from './hud.js';
import { createMatch, PHASE } from './game.js';
import { initAudio, playShot, playDryClick, playReload, playHit, playHurt, playPlantBeep, playExplosion, playRoundEnd, playBuy, playStep, playGrenadePin, setMuted, isMuted } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

window.addEventListener('error', (event) => {
  document.documentElement.dataset.error = String(event.message ?? event.error ?? 'error');
});

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const grenade = createGrenade(scene, world.colliders);
const hud = createHud(!!shot);
const playerBody = createBody(world.colliders, MAP.attackerSpawn[0]);
const weapons = createWeaponSet(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const shootDirection = new THREE.Vector3();
const tmpVector = new THREE.Vector3();

const player = {
  isPlayer: true,
  name: 'You',
  alive: true,
  health: 100,
  position: playerBody.state.position,
  speed: 0,
};

let shotsHeard = [];
let spectateIndex = 0;
let started = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let dryClickAt = -1;
function dryClick(now) {
  if (now - dryClickAt < 0.3) return;
  dryClickAt = now;
  playDryClick();
}
let plantProgress = 0;
let lastPlantBeep = 0;
let buyOpen = false;

const body = playerBody.state;

function aliveCounts() {
  const cobalt = bots.aliveOf('cobalt').length + (player.alive ? 1 : 0);
  const rust = bots.aliveOf('rust').length;
  return { cobalt, rust };
}

function matchEvents() {
  return {
    onBuyPhase(round) {
      resetRound();
      buyOpen = true;
      hud.setObjective('Buy weapons — the round starts soon');
      hud.showBanner(`Round ${round} — buy phase`);
      hud.showBuy(match.state.money, weapons.state.owned, onBuy);
      hud.setBuyTimer(match.state.phaseLeft);
      // The buy menu needs the mouse, so release pointer lock while it is open.
      // Deferred: the Play click's own lock request lands first, then this lets go.
      if (!shot) setTimeout(() => { if (match.state.phase === PHASE.BUY) input.releaseLock(); }, 100);
    },
    onRoundStart(round) {
      buyOpen = false;
      hud.hideBuy();
      hud.setObjective(match.state.plantedSite ? 'Defend the Igniter' : 'Plant the Igniter at Furnace A or B');
      hud.showBanner(`Round ${round} — click the game to lock your mouse, then plant the Igniter`);
    },
    onRoundEnd(winner, reason, playerWon) {
      buyOpen = false;
      hud.hideBuy();
      hud.setProgress(null, 0);
      playRoundEnd(playerWon);
      hud.showBanner(playerWon ? `Round won — ${reason}` : `Round lost — ${reason}`, 4200);
      hud.showOverlay('round', { won: playerWon, reason, cobalt: match.state.scoreCobalt, rust: match.state.scoreRust });
      if (document.pointerLockElement) document.exitPointerLock();
    },
    onMatchEnd(winner) {
      hud.showOverlay('match', { winner, cobalt: match.state.scoreCobalt, rust: match.state.scoreRust, kills: match.state.kills, deaths: match.state.deaths });
      if (document.pointerLockElement) document.exitPointerLock();
    },
    onPlanted(site) {
      hud.setObjective('Igniter planted — defend it until it detonates');
      hud.showBanner(`Igniter planted at Furnace ${site} — defend it!`, 4200);
      playPlantBeep(true);
    },
    onDetonation(site) {
      const center = MAP.sites[site].center;
      effects.explosion(new THREE.Vector3(center.x, 1, center.z));
      playExplosion();
      hud.showBanner(`The Igniter detonated at Furnace ${site}`);
    },
  };
}

const match = createMatch(matchEvents());

function onBuy(id) {
  if (match.state.phase !== PHASE.BUY) return;
  if (WEAPONS[id]) {
    const price = weapons.buy(id, match.state.money);
    if (price === null) return;
    match.state.money -= price;
    weapons.switchTo(id);
    playBuy();
  } else if (id === 'grenade') {
    if (match.state.money < GRENADE_PRICE || weapons.state.grenades >= 2) return;
    match.state.money -= GRENADE_PRICE;
    weapons.state.grenades += 1;
    playBuy();
  } else if (id === 'armor') {
    if (match.state.money < ARMOR_PRICE || weapons.state.armor >= 50) return;
    match.state.money -= ARMOR_PRICE;
    weapons.state.armor = 50;
    playBuy();
  }
  hud.setMoney(match.state.money);
  if (buyOpen) hud.showBuy(match.state.money, weapons.state.owned, onBuy);
  const def = weapons.currentDef();
  const slot = weapons.ammoOf(weapons.state.current);
  hud.setAmmo(slot.mag, slot.reserve, def.name);
}

const bots = createBots(scene, world, {
  onBotShot(bot, from, to, distance) {
    effects.tracer(from, to);
    playShot('carbine', distance);
    shotsHeard.push({ team: bot.team, pos: from.clone(), at: elapsed });
    if (shotsHeard.length > 8) shotsHeard.shift();
  },
  onDamage(foe, amount, attacker, headshot) {
    if (foe.isPlayer) damagePlayer(amount, attacker, headshot);
    else bots.damage(foe, amount, attacker, headshot);
  },
  onKill(bot, attacker, headshot) {
    const killerName = attacker.isPlayer ? 'You' : attacker.name;
    hud.killfeed(killerName, bot.name, headshot, attacker.isPlayer ? 'cobalt' : attacker.team);
    if (attacker.isPlayer) {
      match.onKill('cobalt');
      playHit(true);
      hud.hitMarker(true, 140);
    }
    checkRoundEnd();
  },
  onPlanted(site) {
    if (match.state.plantedSite === null) match.plant(site);
  },
  onDefused() {
    match.defuse();
  },
});

function resetRound() {
  bots.reset();
  playerBody.reset(MAP.attackerSpawn[0]);
  player.alive = true;
  player.health = 100;
  weapons.refillAmmo();
  weapons.resetRound();
  weapons.state.grenades = 0;
  weapons.state.armor = 0;
  weapons.switchTo('pistol');
  plantProgress = 0;
  shotsHeard = [];
  spectateIndex = 0;
  hud.setSpectate(null);
  hud.setProgress(null, 0);
  hud.setHealth(100, 0);
  const def = weapons.currentDef();
  const slot = weapons.ammoOf(weapons.state.current);
  hud.setAmmo(slot.mag, slot.reserve, def.name);
  hud.setScore(match.state.scoreCobalt, match.state.scoreRust, match.state.round);
  hud.setMoney(match.state.money);
  const counts = aliveCounts();
  hud.setAlive(counts.cobalt, counts.rust);
}

function checkRoundEnd() {
  if (match.state.phase !== PHASE.LIVE) return;
  const counts = aliveCounts();
  hud.setAlive(counts.cobalt, counts.rust);
  if (match.state.plantedSite !== null) return; // fuse or defuse decides it now
  if (counts.rust === 0) match.endRound('cobalt', 'Rust eliminated');
  else if (counts.cobalt === 0) match.endRound('rust', 'Cobalt eliminated');
}

function damagePlayer(amount, attacker, headshot) {
  if (!player.alive || match.state.phase !== PHASE.LIVE) return;
  let remaining = amount;
  if (weapons.state.armor > 0) {
    const absorbed = Math.min(weapons.state.armor, Math.floor(remaining * 0.5));
    weapons.state.armor -= absorbed;
    remaining -= absorbed;
  }
  player.health -= remaining;
  hud.damageFlash();
  playHurt();
  hud.setHealth(player.health, weapons.state.armor);
  if (player.health <= 0) {
    player.health = 0;
    player.alive = false;
    match.onPlayerDeath();
    hud.killfeed(attacker.isPlayer ? 'You' : attacker.name, 'You', headshot, attacker.isPlayer ? 'cobalt' : attacker.team);
    hud.setSpectate('You are down — spectating a teammate. Press Space to switch.');
    if (document.pointerLockElement) document.exitPointerLock();
    checkRoundEnd();
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    initAudio();
    hud.hideOverlay();
  } else if (match.state.phase === PHASE.LIVE && player.alive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  initAudio();
  if (match.state.phase === PHASE.MATCH_END) {
    match.startMatch();
  } else if (match.state.phase === PHASE.MENU) {
    // Start the match on the click itself: if pointer lock is refused, the game
    // still runs and the canvas click re-locks the mouse.
    match.startMatch();
  } else if (match.state.phase === PHASE.ROUND_END) {
    match.state.phaseLeft = 0.01;
  }
  hud.hideOverlay();
  input.requestLock();
});

// Clicking the canvas re-locks the mouse once the buy menu is gone and no overlay
// is showing — the round starts without a gesture, so the player locks by clicking.
let lastLockAttempt = 0;
renderer.domElement.addEventListener('click', () => {
  if (shot) return;
  initAudio();
  if (input.state.locked) return;
  if (match.state.phase !== PHASE.LIVE && match.state.phase !== PHASE.BUY) return;
  if (!document.getElementById('overlay').hidden) return;
  if (!document.getElementById('buy-menu').hidden) return;
  const now = performance.now();
  if (now - lastLockAttempt < 1000) return;
  lastLockAttempt = now;
  input.requestLock();
});

function syncCamera() {
  if (!player.alive) {
    const teammates = bots.aliveOf('cobalt');
    if (teammates.length > 0) {
      const target = teammates[spectateIndex % teammates.length];
      const pos = target.body.state.position;
      const yaw = target.body.state.yaw;
      camera.position.set(pos.x - Math.sin(yaw) * 2.2, pos.y + 2.4, pos.z - Math.cos(yaw) * 2.2);
      camera.lookAt(pos.x, pos.y + 1.4, pos.z);
      return;
    }
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const def = weapons.currentDef();
  if (!weapons.takeRound()) {
    playDryClick();
    return false;
  }
  camera.getWorldDirection(shootDirection);
  const pellets = def.pellets ?? 1;
  let anyHit = false;
  let anyKill = false;
  for (let p = 0; p < pellets; p += 1) {
    shootDirection.x += (random() * 2 - 1) * spread;
    shootDirection.y += (random() * 2 - 1) * spread;
    shootDirection.z += (random() * 2 - 1) * spread;
    shootDirection.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, shootDirection);
    raycaster.far = def.range;
    const targets = world.shootables.concat(bots.hitMeshes());
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) continue;
    const muzzle = camera.position.clone();
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const headshot = hit.object.userData.part === 'head';
      const killed = bots.damage(bot, headshot ? def.headDamage : def.damage, player, headshot);
      hud.hitMarker(killed, shot ? 4000 : 90);
      playHit(killed);
      if (killed) {
        // The killfeed line and the reward already ran via the bots onKill hook.
      }
      effects.tracer(muzzle, hit.point);
      anyHit = true;
      anyKill = anyKill || killed;
    } else {
      effects.tracer(muzzle, hit.point);
      effects.impact(hit.point, hit.face?.normal ?? null, 8);
      anyHit = true;
    }
  }
  weapons.pullTrigger();
  playerBody.recoil(def.recoilPitch + random() * 0.004, (random() * 2 - 1) * def.recoilYaw);
  playShot(def.kind, 0);
  shotsHeard.push({ team: 'cobalt', pos: body.position.clone(), at: elapsed });
  if (shotsHeard.length > 8) shotsHeard.shift();
  const slot = weapons.ammoOf(weapons.state.current);
  hud.setAmmo(slot.mag, slot.reserve, def.name);
  return anyHit;
}

function throwGrenade() {
  if (weapons.state.grenades <= 0 || match.state.phase !== PHASE.LIVE || !player.alive) return;
  weapons.state.grenades -= 1;
  camera.getWorldDirection(shootDirection);
  const origin = camera.position.clone().addScaledVector(shootDirection, 0.5);
  origin.y -= 0.1;
  grenade.throwFrom(origin, shootDirection.clone(), player);
  playGrenadePin();
}

function explodeGrenade(point, thrower) {
  effects.explosion(point);
  playExplosion();
  const victims = [...bots.bots.filter((b) => b.alive)];
  for (const bot of victims) {
    const distance = bot.body.state.position.distanceTo(point);
    if (distance > 6.5) continue;
    const blocked = !bots.losClear(new THREE.Vector3(point.x, point.y + 0.3, point.z), new THREE.Vector3(bot.body.state.position.x, bot.body.state.position.y + 1.1, bot.body.state.position.z));
    let damage = Math.max(12, Math.round(115 * (1 - distance / 6.5)));
    if (blocked) damage = Math.round(damage * 0.4);
    const killed = bots.damage(bot, damage, thrower, false);
    if (killed && thrower.isPlayer) hud.killfeed('You', bot.name, false, 'cobalt');
  }
  if (player.alive) {
    const distance = body.position.distanceTo(point);
    if (distance < 6.5) {
      let damage = Math.max(10, Math.round(100 * (1 - distance / 6.5)));
      damagePlayer(damage, thrower, false);
    }
  }
  checkRoundEnd();
}

function playerSite() {
  for (const [key, box] of Object.entries(world.siteBoxes)) {
    if (box.containsPoint(new THREE.Vector3(body.position.x, 1, body.position.z))) return key;
  }
  return null;
}

function stepGame(dt) {
  elapsed += dt;
  match.step(dt);
  const phase = match.state.phase;

  // Player movement and actions, only while alive and the round is live.
  if (player.alive && (phase === PHASE.LIVE || phase === PHASE.BUY)) {
    const stepped = playerBody.step(dt, input.state.keys);
    if (stepped) playStep(playerBody.groundSpeed() > 3.5);
  }
  player.speed = playerBody.groundSpeed();

  // Bots fight through the buy phase too (they walk to their holds) and the round.
  if (phase === PHASE.LIVE || phase === PHASE.BUY || phase === PHASE.ROUND_END) {
    bots.step(dt, elapsed, {
      phase,
      plantedSite: match.state.plantedSite,
      sites: {
        A: { center: MAP.sites.A.center, box: world.siteBoxes.A },
        B: { center: MAP.sites.B.center, box: world.siteBoxes.B },
      },
      shots: shotsHeard,
      rustAlive: bots.aliveOf('rust'),
      cobaltAlive: bots.aliveOf('cobalt'),
      player,
    });
  }

  weapons.step(dt);
  effects.step(dt);
  const blast = grenade.step(dt);
  if (blast) explodeGrenade(blast.point, blast.thrower);

  // Planting: hold E inside a site while the round is live and nothing is planted.
  if (phase === PHASE.LIVE && player.alive && match.state.plantedSite === null) {
    const site = playerSite();
    if (site && input.state.keys.has('KeyE')) {
      plantProgress += dt / 3;
      if (plantProgress - lastPlantBeep > 1 / 3) {
        lastPlantBeep = plantProgress;
        playPlantBeep(false);
      }
      hud.setProgress(`Planting the Igniter at Furnace ${site}…`, plantProgress);
      if (plantProgress >= 1) {
        plantProgress = 0;
        hud.setProgress(null, 0);
        match.plant(site);
      }
    } else {
      plantProgress = Math.max(0, plantProgress - dt / 2);
      hud.setProgress(plantProgress > 0 ? 'Planting interrupted' : null, plantProgress);
    }
  }

  // HUD readouts.
  const counts = aliveCounts();
  hud.setAlive(counts.cobalt, counts.rust);
  hud.setScore(match.state.scoreCobalt, match.state.scoreRust, match.state.round);
  hud.setMoney(match.state.money);
  if (phase === PHASE.BUY) {
    hud.setTimer(match.state.phaseLeft, false);
    hud.setBuyTimer(match.state.phaseLeft);
  } else if (phase === PHASE.LIVE) {
    const urgent = match.state.plantedSite !== null ? match.state.fuseLeft < 10 : match.state.phaseLeft < 15;
    hud.setTimer(match.state.plantedSite !== null ? match.state.fuseLeft : match.state.phaseLeft, urgent);
    if (match.state.plantedSite !== null) hud.setObjective(`Igniter planted at Furnace ${match.state.plantedSite} — defend it`);
  } else if (phase === PHASE.ROUND_END || phase === PHASE.MATCH_END) {
    hud.setTimer(0, false);
  }
  hud.setCrosshairSpread(weapons.spread(player.speed) * 900);
  hud.setHealth(player.health, weapons.state.armor);
  const def = weapons.currentDef();
  const slot = weapons.ammoOf(weapons.state.current);
  hud.setAmmo(slot.mag, slot.reserve, def.name);

  // Site markers pulse; the planted site burns brighter.
  const pulse = 1 + Math.sin(elapsed * 3) * 0.15;
  for (const [key, marker] of Object.entries(world.siteMarkers)) {
    const planted = match.state.plantedSite === key;
    marker.scale.setScalar(planted ? pulse * 1.5 : pulse);
    marker.rotation.y += dt * (planted ? 2.4 : 0.8);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }
  const look = input.takeLook();
  playerBody.look(look.x, look.y);
  const phase = match.state.phase;

  if (input.wasPressed('KeyM')) setMuted(!isMuted());
  if (input.wasPressed('Space') && !player.alive) {
    const teammates = bots.aliveOf('cobalt');
    if (teammates.length > 0) spectateIndex = (spectateIndex + 1) % teammates.length;
  }
  if (phase === PHASE.BUY && input.wasPressed('KeyB')) {
    buyOpen = !buyOpen;
    if (buyOpen) {
      hud.showBuy(match.state.money, weapons.state.owned, onBuy);
      input.releaseLock();
    } else {
      hud.hideBuy();
      input.requestLock();
    }
  }
  if (phase === PHASE.BUY) {
    if (input.wasPressed('Digit2')) onBuy('carbine');
    if (input.wasPressed('Digit3')) onBuy('dmr');
    if (input.wasPressed('Digit4')) onBuy('shotgun');
    if (input.wasPressed('Digit5')) onBuy('grenade');
    if (input.wasPressed('Digit6')) onBuy('armor');
  }
  if (phase === PHASE.LIVE && player.alive) {
    if (input.state.firing && weapons.ready()) shoot(weapons.spread(player.speed));
    if (input.state.firing && weapons.ammoOf(weapons.state.current).mag === 0 && weapons.state.reloadLeft === 0) dryClick(elapsed);
    if (input.wasPressed('KeyR') && weapons.reload()) playReload();
    if (input.wasPressed('Digit1')) weapons.switchTo('pistol');
    if (input.wasPressed('Digit2')) weapons.switchTo('carbine');
    if (input.wasPressed('Digit3')) weapons.switchTo('dmr');
    if (input.wasPressed('Digit4')) weapons.switchTo('shotgun');
    if (input.wasPressed('KeyG')) throwGrenade();
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    stepGame(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  syncCamera();
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) stepGame(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      document.documentElement.dataset.shotReady = '1';
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'start') {
    body.position.set(0, 0, 14);
    body.yaw = 0;
    body.pitch = 0.02;
    settle(20);
    hud.showOverlay('menu');
  } else if (name === 'buy') {
    match.startMatch();
    body.position.set(-2, 0, 14);
    body.yaw = 0.15;
    body.pitch = 0;
    settle(10);
    hud.showBuy(match.state.money, weapons.state.owned, () => {});
  } else if (name === 'play') {
    match.startMatch();
    match.startRound();
    // Stage the duel: one Rust bot down in the open mid lane, a second still
    // standing beyond it, and one teammate off to the left.
    const rust = bots.aliveOf('rust')[0];
    rust.body.state.position.set(0.5, 0, -3.5);
    rust.body.state.yaw = Math.PI;
    rust.mesh.position.set(0.5, 0, -3.5);
    const rust2 = bots.aliveOf('rust')[1];
    rust2.body.state.position.set(3.4, 0, -4.5);
    rust2.body.state.yaw = Math.PI - 0.4;
    rust2.mesh.position.set(3.4, 0, -4.5);
    const mate = bots.aliveOf('cobalt')[0];
    mate.body.state.position.set(-6.5, 0, 4);
    mate.body.state.yaw = 0.3;
    mate.mesh.position.set(-6.5, 0, 4);
    body.position.set(0, 0, 8);
    body.yaw = 0;
    body.pitch = 0;
    weapons.buy('carbine', 100000);
    weapons.switchTo('carbine');
    settle(12);
    const head = new THREE.Vector3(0.5, 1.55, -3.5);
    aimAt(head);
    shoot(0);
    settle(4);
    hud.setScore(match.state.scoreCobalt, match.state.scoreRust, match.state.round);
  } else if (name === 'end') {
    match.startMatch();
    match.startRound();
    match.state.scoreCobalt = 1;
    const rust = bots.aliveOf('rust')[0];
    rust.body.state.position.set(2, 0, -2);
    rust.body.state.yaw = Math.PI;
    bots.damage(rust, 500, player, true);
    body.position.set(0, 0, 8);
    body.yaw = 0.1;
    body.pitch = 0;
    settle(20);
    match.endRound('cobalt', 'Rust eliminated');
    hud.setTimer(0, false);
    hud.showOverlay('round', { won: true, reason: 'Rust eliminated', cobalt: 1, rust: 0 });
  }
  syncCamera();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setHealth(100, 0);
hud.setAmmo(weapons.ammoOf('pistol').mag, weapons.ammoOf('pistol').reserve, 'P9 Sidearm');
hud.setScore(0, 0, 1);
hud.setMoney(800);
// Debug handle for automated play-tests: read-only snapshots of match state.
window.__game = {
  match,
  player,
  bots,
  weapons,
  get phase() { return match.state.phase; },
  get counts() { return aliveCounts(); },
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
