// The arsenal: four hitscan weapons plus a frag grenade, each with its own damage,
// fire rate, spread, recoil, magazine and price. Accuracy is the whole game — every
// weapon's spread grows with movement speed and with sustained fire, so stopping to
// aim pays, and the pistol stays competitive up close. One view model per weapon is
// built from boxes and swapped in when the player switches.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 34, headDamage: 102, fireGap: 0.16, mag: 12, reserve: 48,
    reloadTime: 1.3, spreadStill: 0.004, spreadMove: 0.02, spreadBloom: 0.006,
    recoilPitch: 0.011, recoilYaw: 0.004, auto: false, range: 45,
  },
  carbine: {
    id: 'carbine', name: 'VK-7 Carbine', kind: 'carbine', price: 2700,
    damage: 30, headDamage: 120, fireGap: 0.098, mag: 30, reserve: 90,
    reloadTime: 1.9, spreadStill: 0.0022, spreadMove: 0.028, spreadBloom: 0.004,
    recoilPitch: 0.013, recoilYaw: 0.005, auto: true, range: 70,
  },
  dmr: {
    id: 'dmr', name: 'LS-9 Longshot', kind: 'dmr', price: 3100,
    damage: 72, headDamage: 220, fireGap: 0.55, mag: 8, reserve: 24,
    reloadTime: 2.6, spreadStill: 0.0006, spreadMove: 0.05, spreadBloom: 0.012,
    recoilPitch: 0.035, recoilYaw: 0.006, auto: false, range: 90,
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 Scattergun', kind: 'shotgun', price: 1700,
    damage: 16, headDamage: 32, fireGap: 0.85, mag: 6, reserve: 24,
    reloadTime: 2.2, spreadStill: 0.02, spreadMove: 0.035, spreadBloom: 0.01,
    recoilPitch: 0.03, recoilYaw: 0.012, auto: false, range: 22, pellets: 8,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

const MOVE_REFERENCE = 5.2;

function buildModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a525c'), roughness: 0.4, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const group = new THREE.Group();
  function part(w, h, d, x, y, z, material = metal) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  if (def.kind === 'pistol') {
    part(0.05, 0.07, 0.22, 0, 0, -0.1);
    part(0.045, 0.12, 0.06, 0, -0.08, 0.03, grip);
    part(0.02, 0.02, 0.03, 0, 0.045, -0.19, accent);
  } else if (def.kind === 'dmr') {
    part(0.07, 0.09, 0.55, 0, 0, -0.15);
    part(0.035, 0.035, 0.5, 0, 0.02, -0.55, grip);
    part(0.05, 0.05, 0.12, 0, 0.07, -0.28, accent);
    part(0.06, 0.07, 0.2, 0, -0.02, 0.28, grip);
  } else if (def.kind === 'shotgun') {
    part(0.08, 0.1, 0.5, 0, 0, -0.12);
    part(0.055, 0.055, 0.46, 0, -0.02, -0.32, grip);
    part(0.07, 0.08, 0.18, 0, -0.02, 0.26, grip);
    part(0.03, 0.03, 0.1, 0, 0.06, -0.2, accent);
  } else {
    part(0.09, 0.1, 0.42, 0, 0, -0.1);
    part(0.045, 0.045, 0.4, 0, 0.025, -0.42, grip);
    part(0.075, 0.08, 0.22, 0, -0.02, 0.26, grip);
    part(0.05, 0.12, 0.06, 0, -0.1, -0.05, grip);
  }
  group.position.set(0.26, -0.24, -0.5);
  group.scale.setScalar(0.82);
  return group;
}

export function createWeaponSet(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    models[def.id] = buildModel(def);
    models[def.id].visible = false;
    camera.add(models[def.id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.22, -1.05);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  const state = {
    current: 'pistol', owned: new Set(['pistol']), cooldown: 0, reloadLeft: 0,
    flash: 0, kick: 0, bloom: 0, grenades: 0, armor: 0,
  };

  function currentDef() {
    return WEAPONS[state.current];
  }

  function showModel() {
    for (const [id, model] of Object.entries(models)) model.visible = id === state.current;
  }
  showModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    const model = models[state.current];
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 10 : 0;
    const def = currentDef();
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = ammo[state.current];
        const take = Math.min(def.mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    defs: WEAPONS,
    step,
    currentDef,
    ammoOf(id) {
      return ammo[id];
    },
    ready() {
      const slot = ammo[state.current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const def = currentDef();
      state.cooldown = def.fireGap;
      state.flash = 0.06;
      state.kick = def.kind === 'dmr' ? 0.09 : 0.055;
      state.bloom = Math.min(0.05, state.bloom + def.spreadBloom);
    },
    takeRound() {
      const slot = ammo[state.current];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      const slot = ammo[state.current];
      if (state.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return false;
      state.reloadLeft = def.reloadTime;
      return true;
    },
    spread(speed) {
      const def = currentDef();
      return def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMove + state.bloom;
    },
    switchTo(id) {
      if (!state.owned.has(id) || state.reloadLeft > 0 || id === state.current) return false;
      state.current = id;
      state.cooldown = Math.max(state.cooldown, 0.25);
      showModel();
      return true;
    },
    buy(id, money) {
      const def = WEAPONS[id];
      if (!def || state.owned.has(id) || money < def.price) return null;
      state.owned.add(id);
      ammo[id] = { mag: def.mag, reserve: def.reserve };
      return def.price;
    },
    refillAmmo() {
      for (const def of Object.values(WEAPONS)) {
        if (state.owned.has(def.id)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
      }
    },
    resetRound() {
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
