// Transient effects, pooled and reused: tracer lines, impact sparks, explosion
// billboards and the frag grenade itself. Nothing here allocates per frame — tracers
// and sparks live in fixed pools and are hidden again when their life runs out.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { glowTexture } from './textures.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 160;

export function createEffects(scene) {
  const tracerPool = [];
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPositions = new Float32Array(TRACER_COUNT * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerLines.frustumCulled = false;
  scene.add(tracerLines);
  for (let i = 0; i < TRACER_COUNT; i += 1) tracerPool.push({ life: 0, index: i });

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(SPARK_COUNT * 3);
  const sparkVelocities = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) sparkVelocities.push(new THREE.Vector3());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.95,
    depthWrite: false, sizeAttenuation: true,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkLife = new Float32Array(SPARK_COUNT);

  const glowTex = glowTexture();
  const blast = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }));
  blast.scale.set(1, 1, 1);
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18, 1.6);
  scene.add(blastLight);
  let blastLife = 0;

  let tracerCursor = 0;
  let sparkCursor = 0;

  function tracer(from, to) {
    const slot = tracerPool[tracerCursor];
    tracerCursor = (tracerCursor + 1) % TRACER_COUNT;
    slot.life = 0.09;
    tracerPositions[slot.index * 6] = from.x;
    tracerPositions[slot.index * 6 + 1] = from.y;
    tracerPositions[slot.index * 6 + 2] = from.z;
    tracerPositions[slot.index * 6 + 3] = to.x;
    tracerPositions[slot.index * 6 + 4] = to.y;
    tracerPositions[slot.index * 6 + 5] = to.z;
    tracerGeo.attributes.position.needsUpdate = true;
  }

  function impact(point, normal, count = 10) {
    for (let n = 0; n < count; n += 1) {
      const i = sparkCursor;
      sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
      sparkPositions[i * 3] = point.x;
      sparkPositions[i * 3 + 1] = point.y;
      sparkPositions[i * 3 + 2] = point.z;
      const v = sparkVelocities[i];
      v.set((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
      if (normal) v.addScaledVector(normal, 1.5);
      sparkLife[i] = 0.35 + Math.random() * 0.3;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function explosion(point) {
    blast.position.copy(point);
    blast.scale.set(9, 9, 1);
    blast.material.opacity = 1;
    blastLight.position.copy(point);
    blastLight.position.y += 1;
    blastLight.intensity = 220;
    blastLife = 0.7;
    impact(point, null, 60);
  }

  function step(dt) {
    for (const slot of tracerPool) {
      if (slot.life > 0) {
        slot.life -= dt;
        if (slot.life <= 0) {
          tracerPositions[slot.index * 6 + 3] = tracerPositions[slot.index * 6];
          tracerPositions[slot.index * 6 + 4] = tracerPositions[slot.index * 6 + 1];
          tracerPositions[slot.index * 6 + 5] = tracerPositions[slot.index * 6 + 2];
          tracerGeo.attributes.position.needsUpdate = true;
        }
      }
    }
    let anySpark = false;
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      if (sparkLife[i] > 0) {
        sparkLife[i] -= dt;
        anySpark = true;
        sparkVelocities[i].y -= 9 * dt;
        sparkPositions[i * 3] += sparkVelocities[i].x * dt;
        sparkPositions[i * 3 + 1] = Math.max(0.02, sparkPositions[i * 3 + 1] + sparkVelocities[i].y * dt);
        sparkPositions[i * 3 + 2] += sparkVelocities[i].z * dt;
        if (sparkLife[i] <= 0) sparkPositions[i * 3 + 1] = -10;
      }
    }
    if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
    if (blastLife > 0) {
      blastLife -= dt;
      const t = Math.max(0, blastLife / 0.7);
      blast.material.opacity = t;
      blast.scale.set(9 * (1.6 - t * 0.6), 9 * (1.6 - t * 0.6), 1);
      blastLight.intensity = 220 * t;
      if (blastLife <= 0) {
        blast.material.opacity = 0;
        blastLight.intensity = 0;
      }
    }
  }

  return { tracer, impact, explosion, step };
}

// A thrown frag: ballistic flight, a bounce off the floor and walls (approximated
// against the world's collider boxes), then a fuse detonation with radial falloff.
export function createGrenade(scene, colliders) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c343c'), roughness: 0.5, metalness: 0.6 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  const state = {
    active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    fuse: 0, thrownBy: null,
  };
  const probe = new THREE.Box3();

  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  return {
    state,
    mesh,
    throwFrom(origin, direction, thrower) {
      state.active = true;
      state.position.copy(origin);
      state.velocity.copy(direction).multiplyScalar(16);
      state.velocity.y += 3.5;
      state.fuse = 2.2;
      state.thrownBy = thrower;
      mesh.visible = true;
      mesh.position.copy(origin);
    },
    step(dt) {
      if (!state.active) return null;
      state.fuse -= dt;
      state.velocity.y -= 14 * dt;
      const next = state.position.clone().addScaledVector(state.velocity, dt);
      if (overlaps(next.x, state.position.y, state.position.z)) state.velocity.x *= -0.45;
      else state.position.x = next.x;
      if (overlaps(state.position.x, next.y, state.position.z)) state.velocity.y *= -0.45;
      else state.position.y = next.y;
      if (overlaps(state.position.x, state.position.y, next.z)) state.velocity.z *= -0.45;
      else state.position.z = next.z;
      if (state.position.y < 0.09) {
        state.position.y = 0.09;
        state.velocity.y = Math.abs(state.velocity.y) * 0.45;
        state.velocity.x *= 0.7;
        state.velocity.z *= 0.7;
      }
      mesh.position.copy(state.position);
      if (state.fuse <= 0) {
        state.active = false;
        mesh.visible = false;
        return { point: state.position.clone(), thrower: state.thrownBy };
      }
      return null;
    },
  };
}
