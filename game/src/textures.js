// Procedural canvas textures: every surface in Ember Yard is painted at boot from the
// six palette colours, so the game ships no image assets and makes no network request.
// Each painter draws on a 256 px canvas with a seeded shuffle of speckles, seams and
// wear, then the texture is wrapped and repeated by the mesh that uses it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

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

function canvasTexture(size, seed, paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  paint(ctx, size, mulberry32(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function speckle(ctx, size, random, count, color, alpha, maxRadius) {
  for (let i = 0; i < count; i += 1) {
    ctx.globalAlpha = alpha * (0.4 + random() * 0.6);
    ctx.fillStyle = color;
    const r = 0.5 + random() * maxRadius;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Weathered concrete: pale slab joints, dark aggregate speckle, faint rust bleed.
export function concreteTexture(seed = 11, repeatX = 8, repeatY = 8) {
  return canvasTexture(256, seed, (ctx, size, random) => {
    ctx.fillStyle = '#39424d';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, random, 2600, '#20262e', 0.5, 1.6);
    speckle(ctx, size, random, 1200, '#55636f', 0.35, 1.4);
    speckle(ctx, size, random, 90, '#7a4a28', 0.25, 2.2);
    ctx.strokeStyle = 'rgba(12,15,19,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    ctx.strokeStyle = 'rgba(12,15,19,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
  }, repeatX, repeatY);
}

// Corrugated steel wall: vertical ribs, a top rail, rivets, grime at the base.
export function steelTexture(seed = 23, repeatX = 4, repeatY = 1) {
  return canvasTexture(256, seed, (ctx, size, random) => {
    ctx.fillStyle = '#2c3540';
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 16) {
      const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0.10)');
      grad.addColorStop(0.45, 'rgba(0,0,0,0.22)');
      grad.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 16, size);
    }
    speckle(ctx, size, random, 700, '#10141a', 0.5, 1.8);
    speckle(ctx, size, random, 60, '#8a4f24', 0.3, 2.4);
    ctx.fillStyle = 'rgba(16,20,26,0.9)';
    ctx.fillRect(0, 0, size, 10);
    ctx.fillRect(0, size - 26, size, 26);
    ctx.fillStyle = 'rgba(233,230,223,0.55)';
    for (let x = 8; x < size; x += 32) {
      ctx.beginPath();
      ctx.arc(x, 5, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, repeatX, repeatY);
}

// Shipping container: flat panels, a door seam, stencilled number, ember stripe.
export function containerTexture(seed = 37, accent = '#ff7a1a') {
  return canvasTexture(256, seed, (ctx, size, random) => {
    ctx.fillStyle = '#31404f';
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 32) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, 0, 4, size);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x + 4, 0, 3, size);
    }
    speckle(ctx, size, random, 500, '#141a20', 0.45, 1.6);
    speckle(ctx, size, random, 40, '#8a4f24', 0.3, 2.0);
    ctx.fillStyle = accent;
    ctx.fillRect(0, size - 18, size, 10);
    ctx.fillStyle = 'rgba(233,230,223,0.85)';
    ctx.font = 'bold 34px monospace';
    ctx.fillText('07', 18, 64);
    ctx.font = 'bold 15px monospace';
    ctx.fillText('EMBERLINE', 18, 92);
  }, 1, 1);
}

// Wooden crate: planks, grain strokes, dark gaps, corner wear.
export function crateTexture(seed = 51) {
  return canvasTexture(256, seed, (ctx, size, random) => {
    ctx.fillStyle = '#6b4f2e';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 42) {
      ctx.fillStyle = `rgba(0,0,0,${0.18 + random() * 0.12})`;
      ctx.fillRect(0, y, size, 3);
      for (let i = 0; i < 26; i += 1) {
        ctx.strokeStyle = `rgba(40,26,12,${0.12 + random() * 0.2})`;
        ctx.lineWidth = 1;
        const gy = y + 5 + random() * 34;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(size * 0.3, gy + random() * 4 - 2, size * 0.7, gy + random() * 4 - 2, size, gy);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(20,12,4,0.8)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, size - 6, size - 6);
  }, 1, 1);
}

// Hazard chevrons for site borders and the plant zones.
export function hazardTexture(seed = 67, accent = '#ff7a1a') {
  return canvasTexture(128, seed, (ctx, size) => {
    ctx.fillStyle = '#14181d';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = accent;
    for (let i = -2; i < 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 32, size);
      ctx.lineTo(i * 32 + 16, 0);
      ctx.lineTo(i * 32 + 32, 0);
      ctx.lineTo(i * 32 + 16, size);
      ctx.closePath();
      ctx.fill();
    }
  }, 4, 1);
}

// A soft radial glow used for muzzle light sprites and explosion billboards.
export function glowTexture() {
  return canvasTexture(128, 3, (ctx, size) => {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,220,160,1)');
    grad.addColorStop(0.35, 'rgba(255,122,26,0.75)');
    grad.addColorStop(1, 'rgba(255,122,26,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }, 1, 1);
}

export { PALETTE };
