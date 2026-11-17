// Foundry Yard, an original map: a decommissioned steel foundry's open yard, 44 by 36 m,
// ringed by corrugated walls. Attackers (Cobalt) spawn at the south gate; defenders
// (Rust) hold the north end. Two plant sites — Furnace A in the west, Furnace B in the
// east — are reached by three lanes: West Alley, Mid (through the container choke) and
// East Alley. Crates, containers and low walls break every sightline into short,
// tactical duels. Every box is a collider for movement and a surface bullets stop on.
// The waypoint graph at the bottom is what the bots navigate.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';
import { concreteTexture, steelTexture, containerTexture, crateTexture, hazardTexture } from './textures.js';

export const MAP = {
  bounds: { minX: -22, maxX: 22, minZ: -18, maxZ: 18 },
  sites: {
    A: { name: 'Furnace A', center: new THREE.Vector3(-16, 0, -12), size: 5.5 },
    B: { name: 'Furnace B', center: new THREE.Vector3(16, 0, -12), size: 5.5 },
  },
  attackerSpawn: [
    { x: -6, z: 15, yaw: 0 },
    { x: -2, z: 15.5, yaw: 0 },
    { x: 2, z: 15.5, yaw: 0 },
    { x: 6, z: 15, yaw: 0 },
    { x: 0, z: 13, yaw: 0 },
  ],
  defenderSpawn: [
    { x: -16, z: -15, yaw: Math.PI },
    { x: -8, z: -15.5, yaw: Math.PI },
    { x: 0, z: -15.5, yaw: Math.PI },
    { x: 8, z: -15.5, yaw: Math.PI },
    { x: 16, z: -15, yaw: Math.PI },
  ],
};

// Waypoint graph: nodes the bots walk between. Edges are pairs of node indices.
export const WAYPOINTS = [
  [-6, 15], [0, 15], [6, 15], // 0-2 attacker spawn
  [-14, 10], [-6, 9], [0, 9], [6, 9], [14, 10], // 3-7 south mid
  [-14, 3], [-6, 2], [0, 2], [6, 2], [14, 3], // 8-12 mid
  [-14, -4], [-6, -5], [0, -5], [6, -5], [14, -4], // 13-17 north mid
  [-16, -12], [-10, -11], [0, -12], [10, -11], [16, -12], // 18-22 sites + north
  [-16, -15], [-8, -15], [0, -15], [8, -15], [16, -15], // 23-27 defender spawn
  [-19, 6], [19, 6], [-19, -8], [19, -8], // 28-31 alley edges
];
export const WAYPOINT_EDGES = [
  [0, 1], [1, 2], [0, 3], [1, 4], [1, 5], [2, 6], [2, 7],
  [3, 4], [4, 5], [5, 6], [6, 7], [3, 8], [4, 9], [5, 10], [6, 11], [7, 12],
  [8, 9], [9, 10], [10, 11], [11, 12], [8, 13], [9, 14], [10, 15], [11, 16], [12, 17],
  [13, 14], [14, 15], [15, 16], [16, 17], [13, 18], [14, 19], [15, 20], [16, 21], [17, 22],
  [18, 19], [19, 20], [20, 21], [21, 22], [18, 23], [19, 24], [20, 25], [21, 26], [22, 27],
  [23, 24], [24, 25], [25, 26], [26, 27], [3, 28], [28, 29], [29, 13], [7, 30], [30, 31], [31, 17],
  [13, 29], [17, 31], [8, 28], [12, 30], [18, 29], [22, 31],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(11, 10, 8), roughness: 0.95, metalness: 0.02 });
  const steel = new THREE.MeshStandardMaterial({ map: steelTexture(23, 6, 1), roughness: 0.7, metalness: 0.45 });
  const steelDark = new THREE.MeshStandardMaterial({ map: steelTexture(29, 4, 1), color: new THREE.Color('#8a97a3'), roughness: 0.75, metalness: 0.4 });
  const containerMat = new THREE.MeshStandardMaterial({ map: containerTexture(37), roughness: 0.65, metalness: 0.5 });
  const containerRust = new THREE.MeshStandardMaterial({ map: containerTexture(41, '#c94f1e'), color: new THREE.Color('#c98a6a'), roughness: 0.7, metalness: 0.45 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(51), roughness: 0.9, metalness: 0.02 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(67), roughness: 0.85, metalness: 0.1 });
  const furnaceMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2a22'), roughness: 0.6, metalness: 0.6 });
  const emberMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.6, roughness: 0.4 });
  const teamA = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.cobalt), emissive: new THREE.Color(TEAM.cobalt), emissiveIntensity: 0.7 });
  const teamB = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM.rust), emissive: new THREE.Color(TEAM.rust), emissiveIntensity: 0.7 });

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and perimeter: 44 x 36 m, 5 m walls, open dusk sky above.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, concrete);
  box(0.4, 5, 36.4, -22.2, 2.5, 0, steel);
  box(0.4, 5, 36.4, 22.2, 2.5, 0, steel);
  box(44.4, 5, 0.4, 0, 2.5, -18.2, steel);
  box(44.4, 5, 0.4, 0, 2.5, 18.2, steel);

  // Site A — Furnace A: a raised platform, a furnace block with a glowing mouth and
  // a chimney, ringed by hazard striping.
  box(7, 0.5, 7, -16, 0.25, -12, steelDark);
  box(7.4, 0.06, 0.5, -16, 0.53, -8.3, hazardMat, false);
  box(7.4, 0.06, 0.5, -16, 0.53, -15.7, hazardMat, false);
  box(2.6, 3.4, 2.2, -17.5, 2.2, -14.5, furnaceMat);
  box(1.4, 1.0, 0.3, -17.5, 1.0, -13.3, emberMat, false);
  const chimneyA = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 6.5, 12), furnaceMat);
  chimneyA.position.set(-19, 3.75, -15.5);
  chimneyA.castShadow = true;
  group.add(chimneyA);
  colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(-19, 3.75, -15.5), new THREE.Vector3(1.3, 6.5, 1.3)));
  shootables.push(chimneyA);
  box(1.2, 1.1, 1.2, -12.8, 1.05, -10.5, crateMat);

  // Site B — Furnace B: stacked containers and a glowing crucible.
  box(7, 0.5, 7, 16, 0.25, -12, steelDark);
  box(7.4, 0.06, 0.5, 16, 0.53, -8.3, hazardMat, false);
  box(7.4, 0.06, 0.5, 16, 0.53, -15.7, hazardMat, false);
  box(4.4, 2.4, 2.4, 17.5, 1.7, -15, containerMat);
  box(3.2, 2.4, 2.4, 17.8, 4.1, -15, containerRust);
  box(1.6, 1.0, 1.6, 13.5, 1.0, -14.5, furnaceMat);
  box(1.2, 0.5, 1.2, 13.5, 1.7, -14.5, emberMat, false);
  box(1.2, 1.1, 1.2, 13, 1.05, -9.5, crateMat);

  // Mid choke: two containers facing each other leave a 3 m gap — the map's hot lane.
  box(4.4, 2.4, 2.4, -5.5, 1.2, 2, containerRust);
  box(4.4, 2.4, 2.4, 5.5, 1.2, 2, containerMat);
  box(1.2, 1.1, 1.2, -1.8, 0.55, 2, crateMat);
  box(1.2, 1.1, 1.2, 1.8, 0.55, 2, crateMat);

  // West and East alleys: low walls and crate stacks for lane fights.
  box(0.6, 1.2, 5, -14, 0.6, 6, steelDark);
  box(0.6, 1.2, 5, 14, 0.6, 6, steelDark);
  box(1.6, 1.1, 1.6, -14, 0.55, -4, crateMat);
  box(1.6, 1.1, 1.6, -11.5, 0.55, -4, crateMat);
  box(1.6, 1.1, 1.6, 14, 0.55, -4, crateMat);
  box(1.6, 1.1, 1.6, 11.5, 0.55, -4, crateMat);
  box(2.4, 1.0, 1.2, -6, 0.5, -8, crateMat);
  box(2.4, 1.0, 1.2, 6, 0.5, -8, crateMat);
  box(1.2, 2.2, 1.2, 0, 1.1, -5.5, steelDark);

  // South spawn cover and north defender cover.
  box(2.4, 0.9, 1.2, -3, 0.45, 12, crateMat);
  box(2.4, 0.9, 1.2, 3, 0.45, 12, crateMat);
  box(2.4, 0.9, 1.2, -9, 0.45, -13, crateMat);
  box(2.4, 0.9, 1.2, 9, 0.45, -13, crateMat);
  box(1.2, 1.1, 1.2, 0, 0.55, 13.5, crateMat);

  // Distant skyline silhouettes outside the walls, for depth at a glance.
  const skylineMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0b0e13'), roughness: 1 });
  for (const [x, z, w, h] of [[-30, -26, 10, 14], [-8, -30, 14, 20], [14, -28, 9, 11], [32, -10, 10, 16], [-32, 8, 8, 10], [30, 14, 12, 18], [-14, 30, 12, 9]]) {
    const silhouette = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), skylineMat);
    silhouette.position.set(x, h / 2 - 1, z);
    group.add(silhouette);
  }

  // Site beacons: floating markers so a new player reads the objective at a glance.
  const siteMarkers = {};
  for (const [key, site] of Object.entries(MAP.sites)) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55),
      key === 'A' ? teamA : teamB,
    );
    marker.position.set(site.center.x, 3.4, site.center.z);
    group.add(marker);
    siteMarkers[key] = marker;
  }

  // Lighting: low ember sun from the west, cool dusk fill, furnace glows at both sites.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#5a6b80'), new THREE.Color('#14100c'), 1.3));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.7);
  sun.position.set(-18, 16, 10);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d90a8'), 0.7);
  fill.position.set(14, 10, 14);
  scene.add(fill);
  for (const site of Object.values(MAP.sites)) {
    const glow = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 12, 1.8);
    glow.position.set(site.center.x, 2.2, site.center.z);
    scene.add(glow);
  }

  const siteBoxes = {};
  for (const [key, site] of Object.entries(MAP.sites)) {
    siteBoxes[key] = new THREE.Box3(
      new THREE.Vector3(site.center.x - site.size / 2, 0, site.center.z - site.size / 2),
      new THREE.Vector3(site.center.x + site.size / 2, 3, site.center.z + site.size / 2),
    );
  }

  return {
    colliders, shootables, group, siteBoxes, siteMarkers,
    spawnPoints: { attackers: MAP.attackerSpawn, defenders: MAP.defenderSpawn },
  };
}
