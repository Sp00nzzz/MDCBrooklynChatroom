/**
 * SMOKE VFX MODULE
 * 
 * Creates cigarette smoke puffs that rise and fade out in world space.
 * Uses Three.js sprites with pooling for performance.
 * 
 * Exports:
 *   - initSmokeVfx(scene)
 *   - spawnSmokePuff(worldPos)
 *   - updateSmokeVfx(deltaTime)
 *   - cleanup()
 */

import * as THREE from 'three';

// ===========================================
// CONSTANTS
// ===========================================

const SPRITES_PER_PUFF = 12; // Number of sprites per smoke puff
const MAX_ACTIVE_SPRITES = 150; // Maximum active smoke sprites (pool size)
const PUFF_LIFETIME = 2.0; // Seconds for each puff to fade out
const PUFF_RISE_SPEED = 0.8; // Units per second upward
const PUFF_DRIFT_SPEED = 0.3; // Units per second for horizontal drift
const PUFF_SIZE_START = 0.15; // Starting size of each sprite
const PUFF_SIZE_END = 0.4; // Ending size (grows as it rises)
const PUFF_SPREAD = 0.2; // Random spread radius when spawning
const PUFF_OPACITY_START = 0.65; // Starting opacity (0-1, lower = more transparent)
const PUFF_OPACITY_END = 0.0; // Ending opacity

// ===========================================
// STATE
// ===========================================

let sceneRef = null;
let smokeTexture = null;
let smokeMaterial = null;
let spritePool = [];
let activeSprites = [];
let initialized = false;

// ===========================================
// TEXTURE GENERATION
// ===========================================

/**
 * Generates a procedural smoke texture using canvas
 * Creates a soft radial gradient blob
 */
function generateSmokeTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Clear with transparency
  ctx.clearRect(0, 0, size, size);
  
  // Create radial gradient for soft smoke blob
  const centerX = size / 2;
  const centerY = size / 2;
  const gradient = ctx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, size / 2
  );
  
  // Soft gray-white gradient
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(0.3, 'rgba(240, 240, 240, 0.7)');
  gradient.addColorStop(0.6, 'rgba(200, 200, 200, 0.4)');
  gradient.addColorStop(1, 'rgba(150, 150, 150, 0)');
  
  // Draw circular blob with slight irregularity
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2.2, 0, Math.PI * 2);
  ctx.fill();
  
  // Create Three.js texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ===========================================
// SPRITE POOLING
// ===========================================

/**
 * Creates a pool of reusable smoke sprites
 */
function createSpritePool() {
  // Generate smoke texture
  smokeTexture = generateSmokeTexture();
  
  // Create shared material (all sprites use the same material)
  smokeMaterial = new THREE.SpriteMaterial({
    map: smokeTexture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  
  // Pre-create sprites for pooling
  for (let i = 0; i < MAX_ACTIVE_SPRITES; i++) {
    const sprite = new THREE.Sprite(smokeMaterial);
    sprite.visible = false;
    sprite.scale.set(PUFF_SIZE_START, PUFF_SIZE_START, 1);
    spritePool.push(sprite);
  }
}

/**
 * Gets an available sprite from the pool
 * @returns {THREE.Sprite|null} Available sprite or null if pool exhausted
 */
function getSpriteFromPool() {
  for (const sprite of spritePool) {
    if (!sprite.visible) {
      return sprite;
    }
  }
  return null; // Pool exhausted
}

// ===========================================
// SMOKE PUFF SPAWNING
// ===========================================

/**
 * Spawns a smoke puff burst at the given world position
 * @param {THREE.Vector3} worldPos - World position to spawn smoke
 */
export function spawnSmokePuff(worldPos) {
  if (!initialized || !sceneRef) return;
  
  // Spawn multiple sprites for a puff effect
  const spritesToSpawn = Math.min(SPRITES_PER_PUFF, MAX_ACTIVE_SPRITES - activeSprites.length);
  
  for (let i = 0; i < spritesToSpawn; i++) {
    const sprite = getSpriteFromPool();
    if (!sprite) break; // No more sprites available
    
    // Random offset within spread radius
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * PUFF_SPREAD;
    const offsetX = Math.cos(angle) * distance;
    const offsetZ = Math.sin(angle) * distance;
    const offsetY = Math.random() * 0.1; // Slight vertical variation
    
    // Set initial position
    sprite.position.set(
      worldPos.x + offsetX,
      worldPos.y + offsetY,
      worldPos.z + offsetZ
    );
    
    // Initialize sprite data
    sprite.userData.age = 0;
    sprite.userData.lifetime = PUFF_LIFETIME;
    sprite.userData.riseSpeed = PUFF_RISE_SPEED * (0.7 + Math.random() * 0.6); // Randomize rise speed
    sprite.userData.driftX = (Math.random() - 0.5) * PUFF_DRIFT_SPEED;
    sprite.userData.driftZ = (Math.random() - 0.5) * PUFF_DRIFT_SPEED;
    sprite.userData.sizeStart = PUFF_SIZE_START * (0.8 + Math.random() * 0.4);
    sprite.userData.sizeEnd = PUFF_SIZE_END * (0.8 + Math.random() * 0.4);
    
    // Reset scale and opacity
    sprite.scale.set(sprite.userData.sizeStart, sprite.userData.sizeStart, 1);
    sprite.material.opacity = PUFF_OPACITY_START;
    
    // Make visible and add to scene
    sprite.visible = true;
    if (!sprite.parent) {
      sceneRef.add(sprite);
    }
    
    // Track as active
    activeSprites.push(sprite);
  }
}

// ===========================================
// UPDATE LOOP
// ===========================================

/**
 * Updates all active smoke sprites
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function updateSmokeVfx(deltaTime) {
  if (!initialized) return;
  
  // Update each active sprite
  for (let i = activeSprites.length - 1; i >= 0; i--) {
    const sprite = activeSprites[i];
    const data = sprite.userData;
    
    // Update age
    data.age += deltaTime;
    
    // Calculate lifetime progress (0 to 1)
    const progress = data.age / data.lifetime;
    
    if (progress >= 1.0) {
      // Lifetime expired - return to pool
      sprite.visible = false;
      activeSprites.splice(i, 1);
      continue;
    }
    
    // Update position (rise and drift)
    sprite.position.y += data.riseSpeed * deltaTime;
    sprite.position.x += data.driftX * deltaTime;
    sprite.position.z += data.driftZ * deltaTime;
    
    // Add slight swirl effect (random rotation)
    const swirlAmount = Math.sin(data.age * 2) * 0.05;
    sprite.position.x += swirlAmount * deltaTime;
    sprite.position.z += Math.cos(data.age * 2) * 0.05 * deltaTime;
    
    // Update scale (grows as it rises)
    const size = data.sizeStart + (data.sizeEnd - data.sizeStart) * progress;
    sprite.scale.set(size, size, 1);
    
    // Update opacity (fades out)
    sprite.material.opacity = PUFF_OPACITY_START + (PUFF_OPACITY_END - PUFF_OPACITY_START) * progress;
  }
}

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Initialize the smoke VFX system
 * @param {THREE.Scene} scene - The Three.js scene
 */
export function initSmokeVfx(scene) {
  if (initialized) {
    console.warn('SmokeVfx already initialized');
    return;
  }
  
  sceneRef = scene;
  createSpritePool();
  initialized = true;
  console.log('Smoke VFX initialized');
}

/**
 * Clean up all resources
 */
export function cleanup() {
  // Remove all sprites from scene
  spritePool.forEach(sprite => {
    if (sprite.parent) {
      sprite.parent.remove(sprite);
    }
  });
  
  // Dispose texture
  if (smokeTexture) {
    smokeTexture.dispose();
    smokeTexture = null;
  }
  
  // Dispose material
  if (smokeMaterial) {
    smokeMaterial.dispose();
    smokeMaterial = null;
  }
  
  spritePool = [];
  activeSprites = [];
  sceneRef = null;
  initialized = false;
}

/**
 * Set whether smoke VFX is enabled (optional utility)
 * @param {boolean} enabled
 */
export function setEnabled(enabled) {
  // Could be used to disable smoke rendering if needed
  // For now, just a placeholder
}
