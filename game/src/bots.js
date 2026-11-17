// Bots: five Rust defenders and four Cobalt teammates who fight beside the player.
// Each bot is a body (the same movement code as the player) plus a small state machine:
// advance along the waypoint graph toward its objective, hold a lane, engage anything
// it can see, plant the Igniter when its site is clear, or defuse one that is ticking.
// A bot shoots only after a reaction delay, in short bursts, with a hit chance that
// falls with distance and target speed — so duels are won by positioning, not reflexes.
// Bots also hear gunshots and turn toward them, and they strafe while firing.
import * as THREE from 'three';
import { createBody } from './player.js';
import { WAYPOINTS, WAYPOINT_EDGES } from './world.js';
import { TEAM } from './palette.js';

const COBALT_NAMES = ['Vex', 'Mara', 'Juno', 'Pike'];
const RUST_NAMES = ['Ash', 'Rook', 'Sable', 'Flint', 'Onyx'];
const BOT_DAMAGE = 24;
const BOT_HEAD_DAMAGE = 60;
const BOT_RANGE = 42;

// Breadth-first path over the waypoint graph, from the node nearest `from` to the
// node nearest `to`. Returns a list of node indices, or [] when already there.
export function findPath(from, to) {
  let fromNode = 0;
  let toNode = 0;
  let fromBest = Infinity;
  let toBest = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const [x, z] = WAYPOINTS[i];
    const dFrom = (x - from.x) ** 2 + (z - from.z) ** 2;
    const dTo = (x - to.x) ** 2 + (z - to.z) ** 2;
    if (dFrom < fromBest) { fromBest = dFrom; fromNode = i; }
    if (dTo < toBest) { toBest = dTo; toNode = i; }
  }
  if (fromNode === toNode) return [toNode];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [fromNode];
  prev[fromNode] = fromNode;
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === toNode) break;
    for (const [a, b] of WAYPOINT_EDGES) {
      const next = a === node ? b : b === node ? a : -1;
      if (next !== -1 && prev[next] === -1) {
        prev[next] = node;
        queue.push(next);
      }
    }
  }
  if (prev[toNode] === -1) return [toNode];
  const path = [];
  let node = toNode;
  while (node !== fromNode) {
    path.unshift(node);
    node = prev[node];
  }
  return path;
}

function buildBotMesh(team) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'cobalt' ? '#2b3a4d' : '#4d2f28'), roughness: 0.85 });
  const plate = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM[team]), roughness: 0.5, metalness: 0.3 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14181d'), roughness: 0.8 });
  function part(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }
  part(0.16, 0.78, 0.18, -0.11, 0.39, 0, cloth); // legs
  part(0.16, 0.78, 0.18, 0.11, 0.39, 0, cloth);
  const torso = part(0.52, 0.62, 0.3, 0, 1.08, 0, cloth);
  part(0.4, 0.3, 0.06, 0, 1.14, -0.17, plate); // chest plate, team colour
  const head = part(0.3, 0.3, 0.3, 0, 1.56, 0, skin);
  part(0.32, 0.1, 0.32, 0, 1.72, 0, plate); // headband, team colour
  const gun = part(0.06, 0.08, 0.62, 0.2, 1.18, -0.3, dark);
  gun.rotation.x = 0.12;
  return { group, torso, head };
}

export function createBots(scene, world, hooks) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const bots = [];
  const tmpDirection = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  function losClear(from, to) {
    tmpDirection.copy(to).sub(from);
    const distance = tmpDirection.length();
    if (distance < 0.01) return true;
    tmpDirection.normalize();
    raycaster.set(from, tmpDirection);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function eyeOf(bot) {
    return tmpTarget.set(bot.body.state.position.x, bot.body.state.position.y + 1.5, bot.body.state.position.z);
  }

  function makeBot(team, name, spawn, index) {
    const mesh = buildBotMesh(team);
    scene.add(mesh.group);
    const body = createBody(world.colliders, spawn);
    const bot = {
      id: `${team}-${index}`,
      name,
      team,
      body,
      mesh: mesh.group,
      torso: mesh.torso,
      head: mesh.head,
      health: 100,
      armor: 0,
      alive: true,
      state: 'advance',
      path: [],
      pathIndex: 0,
      target: null,
      assignedSite: team === 'cobalt' ? (index % 2 === 0 ? 'A' : 'B') : null,
      holdUntil: 0,
      strafeDir: 1,
      strafeUntil: 0,
      reactionLeft: 0,
      burstLeft: 0,
      nextShotAt: 0,
      channel: 0, // plant/defuse progress 0..1
      channelKind: null,
      skill: 0.75 + Math.random() * 0.35,
      hearPos: null,
      hearAt: 0,
      lastPos: new THREE.Vector3(spawn.x, 0, spawn.z),
      stuckAt: 0,
      walkPhase: Math.random() * Math.PI * 2,
    };
    bot.body.state.yaw = spawn.yaw ?? 0;
    return bot;
  }

  function spawnAll() {
    for (const bot of bots) scene.remove(bot.mesh);
    bots.length = 0;
    MAP_SPAWNS.forEach((spawn, i) => {
      bots.push(makeBot('cobalt', COBALT_NAMES[i], spawn, i));
    });
    MAP_DEFENDERS.forEach((spawn, i) => {
      bots.push(makeBot('rust', RUST_NAMES[i], spawn, i));
    });
  }

  // Filled in below once world spawn points exist; spawnAll is called by reset().
  const MAP_SPAWNS = world.spawnPoints.attackers.slice(1);
  const MAP_DEFENDERS = world.spawnPoints.defenders;

  function reset() {
    spawnAll();
    for (const bot of bots) {
      bot.health = 100;
      bot.armor = 0;
      bot.alive = true;
      bot.state = 'advance';
      bot.path = [];
      bot.pathIndex = 0;
      bot.target = null;
      bot.channel = 0;
      bot.channelKind = null;
      bot.mesh.rotation.set(0, bot.body.state.yaw, 0);
      bot.mesh.position.copy(bot.body.state.position);
      bot.mesh.visible = true;
    }
  }

  function setDestination(bot, point) {
    bot.path = findPath(bot.body.state.position, point);
    bot.pathIndex = 0;
  }

  function visibleEnemies(bot, foes, now) {
    const eye = eyeOf(bot).clone();
    const visible = [];
    for (const foe of foes) {
      if (!foe.alive) continue;
      const foePos = foe.isPlayer
        ? new THREE.Vector3(foe.position.x, foe.position.y + 1.3, foe.position.z)
        : new THREE.Vector3(foe.body.state.position.x, foe.body.state.position.y + 1.3, foe.body.state.position.z);
      const distance = eye.distanceTo(foePos);
      if (distance > BOT_RANGE) continue;
      if (losClear(eye, foePos)) visible.push({ foe, distance, pos: foePos });
    }
    return visible;
  }

  function aimAt(bot, point) {
    const pos = bot.body.state.position;
    const dx = point.x - pos.x;
    const dy = (point.y - 1.3) - (pos.y + 1.5);
    const dz = point.z - pos.z;
    const targetYaw = Math.atan2(-dx, -dz);
    let diff = targetYaw - bot.body.state.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.body.state.yaw += Math.max(-0.12, Math.min(0.12, diff));
  }

  function fireAt(bot, foe, distance, now) {
    if (now < bot.nextShotAt) return;
    bot.nextShotAt = now + 0.11;
    const targetSpeed = foe.isPlayer ? foe.speed : Math.hypot(foe.body.state.velocity.x, foe.body.state.velocity.z);
    const chance = Math.max(0.08, Math.min(0.55, (0.62 - distance * 0.009 - targetSpeed * 0.02) * bot.skill));
    const headshot = Math.random() < 0.12;
    const hit = Math.random() < chance;
    const from = new THREE.Vector3(bot.body.state.position.x, bot.body.state.position.y + 1.4, bot.body.state.position.z);
    let to;
    if (hit) {
      const foePos = foe.isPlayer
        ? new THREE.Vector3(foe.position.x, foe.position.y + (headshot ? 1.55 : 1.1), foe.position.z)
        : new THREE.Vector3(foe.body.state.position.x, foe.body.state.position.y + (headshot ? 1.55 : 1.1), foe.body.state.position.z);
      to = foePos;
    } else {
      const foePos = foe.isPlayer ? foe.position : foe.body.state.position;
      to = new THREE.Vector3(
        foePos.x + (Math.random() - 0.5) * 1.6,
        foePos.y + 1.1 + (Math.random() - 0.5) * 1.2,
        foePos.z + (Math.random() - 0.5) * 1.6,
      );
    }
    hooks.onBotShot(bot, from, to, distance);
    if (hit) {
      hooks.onDamage(foe, headshot ? BOT_HEAD_DAMAGE : BOT_DAMAGE, bot, headshot);
    }
    bot.burstLeft -= 1;
  }

  // One fixed step for every living bot. ctx carries the match state the bots read:
  // phase, timeLeft, planted site, player descriptor, and the list of living foes.
  function step(dt, now, ctx) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const pos = bot.body.state.position;
      const foes = bot.team === 'cobalt'
        ? ctx.rustAlive.map((b) => b)
        : [...ctx.cobaltAlive, ctx.player].filter((f) => f.alive);
      // Combat happens only while the round is live: during the buy phase the
      // bots walk to their holds and nobody shoots.
      const seen = ctx.phase === 'live' ? visibleEnemies(bot, foes, now) : [];
      const nearest = seen.sort((a, b) => a.distance - b.distance)[0] ?? null;

      // Hearing: a recent gunshot nearby becomes a place to look.
      if (ctx.shots.length > 0) {
        for (const shot of ctx.shots) {
          if (shot.team !== bot.team && pos.distanceTo(shot.pos) < 26 && shot.at > bot.hearAt) {
            bot.hearPos = shot.pos.clone();
            bot.hearAt = shot.at;
          }
        }
      }

      // Objective state: plant, defuse, or fight for the site.
      bot.channelKind = null;
      if (ctx.phase === 'live') {
        if (bot.team === 'cobalt' && ctx.plantedSite === null && bot.assignedSite) {
          const site = ctx.sites[bot.assignedSite];
          if (site.box.containsPoint(new THREE.Vector3(pos.x, 1, pos.z)) && !nearest) {
            bot.state = 'plant';
            bot.channel = Math.min(1, bot.channel + dt / 3);
            bot.channelKind = 'plant';
            if (bot.channel >= 1) hooks.onPlanted(bot.assignedSite);
          }
        } else if (bot.team === 'rust' && ctx.plantedSite !== null) {
          const site = ctx.sites[ctx.plantedSite];
          if (site.box.containsPoint(new THREE.Vector3(pos.x, 1, pos.z)) && !nearest) {
            bot.state = 'defuse';
            bot.channel = Math.min(1, bot.channel + dt / 5);
            bot.channelKind = 'defuse';
            if (bot.channel >= 1) hooks.onDefused();
          }
        }
      }
      if (bot.channelKind === null) {
        bot.channel = 0;
        if (bot.state === 'plant' || bot.state === 'defuse') bot.state = 'advance';
      }

      if (bot.state === 'plant' || bot.state === 'defuse') {
        if (nearest) bot.state = 'engage';
      }

      // Combat: react, then fire in bursts of 3-5 while strafing.
      const keys = new Set();
      if (nearest) {
        if (bot.target !== nearest.foe) {
          bot.target = nearest.foe;
          bot.reactionLeft = 0.35 + Math.random() * 0.3;
          bot.burstLeft = 0;
        }
        bot.state = 'engage';
        aimAt(bot, nearest.pos);
        if (bot.reactionLeft > 0) {
          bot.reactionLeft -= dt;
        } else {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = 3 + Math.floor(Math.random() * 3);
            bot.nextShotAt = now + 0.15 + Math.random() * 0.25;
          }
          if (now > bot.strafeUntil) {
            bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
            bot.strafeUntil = now + 0.6 + Math.random() * 0.9;
          }
          if (bot.strafeDir > 0) keys.add('KeyD');
          else keys.add('KeyA');
          if (bot.burstLeft > 0) fireAt(bot, nearest.foe, nearest.distance, now);
        }
      } else {
        bot.target = null;
        if (bot.state === 'engage') bot.state = 'advance';
        // Navigation: follow the path, or pick a new destination.
        if (bot.state === 'advance') {
          if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
            let dest;
            if (ctx.phase === 'live' && bot.team === 'cobalt' && bot.assignedSite) {
              dest = ctx.sites[bot.assignedSite].center;
            } else if (ctx.phase === 'live' && bot.team === 'rust' && ctx.plantedSite) {
              dest = ctx.sites[ctx.plantedSite].center;
            } else if (ctx.phase === 'live' && bot.team === 'rust') {
              const site = bot.assignedSite ?? (bot.id.endsWith('0') || bot.id.endsWith('1') ? 'A' : 'B');
              dest = ctx.sites[site].center;
            } else if (bot.hearPos && now - bot.hearAt < 4) {
              dest = bot.hearPos;
            } else {
              const [x, z] = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
              dest = new THREE.Vector3(x, 0, z);
            }
            setDestination(bot, dest);
          }
          const node = WAYPOINTS[bot.path[bot.pathIndex]];
          if (node) {
            const dx = node[0] - pos.x;
            const dz = node[1] - pos.z;
            const distance = Math.hypot(dx, dz);
            if (distance < 0.7) {
              bot.pathIndex += 1;
            } else {
              const targetYaw = Math.atan2(-dx, -dz);
              let diff = targetYaw - bot.body.state.yaw;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              bot.body.state.yaw += Math.max(-0.09, Math.min(0.09, diff));
              if (Math.abs(diff) < 1.1) keys.add('KeyW');
              else if (diff > 0) keys.add('KeyD');
              else keys.add('KeyA');
            }
          }
          // Stuck detection: no progress in 2.5 s means re-path around the obstacle.
          if (pos.distanceTo(bot.lastPos) > 0.15) {
            bot.lastPos.copy(pos);
            bot.stuckAt = now;
          } else if (now - bot.stuckAt > 2.5) {
            bot.path = [];
            bot.stuckAt = now;
            keys.add('KeyS');
          }
        }
      }

      bot.body.step(dt, keys);
      // Walk cycle: legs swing, torso bobs, gun follows the aim.
      bot.walkPhase += dt * (bot.body.groundSpeed() > 0.5 ? 9 : 2);
      const swing = bot.body.groundSpeed() > 0.5 ? Math.sin(bot.walkPhase) * 0.12 : 0;
      bot.mesh.position.set(pos.x, pos.y + Math.abs(Math.sin(bot.walkPhase)) * 0.03, pos.z);
      bot.mesh.rotation.y = bot.body.state.yaw;
      bot.mesh.rotation.x = bot.alive ? 0 : -Math.PI / 2;
      bot.torso.rotation.x = swing * 0.4;
      if (bot.state === 'engage' && nearest) {
        bot.mesh.rotation.y = bot.body.state.yaw;
      }
    }
  }

  function damage(bot, amount, attacker, headshot) {
    if (!bot.alive) return false;
    let remaining = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, Math.floor(remaining * 0.5));
      bot.armor -= absorbed;
      remaining -= absorbed;
    }
    bot.health -= remaining;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.channel = 0;
      bot.mesh.rotation.x = -Math.PI / 2;
      bot.mesh.position.y = 0.25;
      hooks.onKill(bot, attacker, headshot);
      return true;
    }
    // Being shot at snaps the bot's attention to its attacker.
    bot.hearPos = attacker.isPlayer
      ? new THREE.Vector3(attacker.position.x, 0, attacker.position.z)
      : new THREE.Vector3(attacker.body.state.position.x, 0, attacker.body.state.position.z);
    bot.hearAt = performance.now() / 1000;
    return false;
  }

  function aliveOf(team) {
    return bots.filter((bot) => bot.team === team && bot.alive);
  }

  reset();

  return {
    bots,
    step,
    damage,
    reset,
    aliveOf,
    losClear,
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.torso.userData.bot = bot;
        bot.torso.userData.part = 'torso';
        bot.head.userData.bot = bot;
        bot.head.userData.part = 'head';
        meshes.push(bot.torso, bot.head);
      }
      return meshes;
    },
  };
}
