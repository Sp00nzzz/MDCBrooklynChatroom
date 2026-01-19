/**
 * CHOCOLATE CRUMB VFX MODULE
 * 
 * Creates chocolate crumb particles that fall downward when eating Feastables.
 * Uses Three.js sprites with pooling for performance.
 * 
 * Exports:
 *   - initChocolateCrumbVfx(scene)
 *   - spawnChocolateCrumbs(worldPos)
 *   - updateChocolateCrumbVfx(deltaTime)
 *   - cleanup()
 */

import * as THREE from 'three';

// ===========================================
// CONSTANTS
// ===========================================

const CRUMBS_PER_BITE = 12; // Number of crumbs per bite
const MAX_ACTIVE_CRUMBS = 30; // Maximum active crumbs (pool size)
const CRUMB_LIFETIME_MIN = 0.5; // Minimum lifetime in seconds
const CRUMB_LIFETIME_MAX = 1.0; // Maximum lifetime in seconds
const GRAVITY = -2.0; // Units per second squared (downward)
const INITIAL_VELOCITY_Y_MIN = 0.2; // Initial upward velocity (min)
const INITIAL_VELOCITY_Y_MAX = 0.5; // Initial upward velocity (max)
const INITIAL_VELOCITY_SPREAD = 0.3; // Horizontal spread velocity
const CRUMB_SIZE = 0.02; // Fixed crumb size (simpler)
const CRUMB_SPREAD = 0.1; // Random spread radius when spawning
const CRUMB_OPACITY_START = 1.0; // Starting opacity (fully opaque)
const CRUMB_OPACITY_END = 1.0; // Ending opacity (stays fully opaque, no fade)

// Single chocolate color (simplified)
const CHOCOLATE_COLOR = 0x5a3a2a; // Medium brown

// ===========================================
// STATE
// ===========================================

let sceneRef = null;
let crumbTexture = null;
let crumbMaterial = null;
let spritePool = [];
let activeCrumbs = [];
let initialized = false;

// ===========================================
// TEXTURE GENERATION
// ===========================================

/**
 * Generates a simple chocolate crumb texture using canvas
 * Very lightweight - just a solid colored rectangle
 */
function generateCrumbTexture() {
  const size = 32; // Very small texture for performance
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Clear with transparency
  ctx.clearRect(0, 0, size, size);
  
  // Simple rectangular crumb - no gradients, no shadows
  const width = size * 0.7;
  const height = size * 0.5;
  const x = (size - width) / 2;
  const y = (size - height) / 2;
  
  // Convert hex to RGB
  const r = (CHOCOLATE_COLOR >> 16) & 0xff;
  const g = (CHOCOLATE_COLOR >> 8) & 0xff;
  const b = CHOCOLATE_COLOR & 0xff;
  
  // Simple solid fill (fully opaque)
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 1.0)`;
  ctx.fillRect(x, y, width, height);
  
  // Create Three.js texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ===========================================
// SPRITE POOLING
// ===========================================

/**
 * Creates a pool of reusable crumb sprites
 */
function createSpritePool() {
  // Generate crumb texture
  crumbTexture = generateCrumbTexture();
  
  // Create shared material (all sprites use the same material)
  crumbMaterial = new THREE.SpriteMaterial({
    map: crumbTexture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  
  // Pre-create sprites for pooling
  for (let i = 0; i < MAX_ACTIVE_CRUMBS; i++) {
    const sprite = new THREE.Sprite(crumbMaterial);
    sprite.visible = false;
    sprite.scale.set(CRUMB_SIZE, CRUMB_SIZE, 1);
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
// CRUMB SPAWNING
// ===========================================

/**
 * Spawns chocolate crumb particles at the given world position
 * @param {THREE.Vector3} worldPos - World position to spawn crumbs
 */
export function spawnChocolateCrumbs(worldPos) {
  if (!initialized || !sceneRef) return;
  
  // Spawn multiple crumbs for a bite effect
  const crumbsToSpawn = Math.min(CRUMBS_PER_BITE, MAX_ACTIVE_CRUMBS - activeCrumbs.length);
  
  for (let i = 0; i < crumbsToSpawn; i++) {
    const sprite = getSpriteFromPool();
    if (!sprite) break; // No more sprites available
    
    // Random offset within spread radius
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * CRUMB_SPREAD;
    const offsetX = Math.cos(angle) * distance;
    const offsetZ = Math.sin(angle) * distance;
    const offsetY = Math.random() * 0.05; // Slight vertical variation
    
    // Set initial position
    sprite.position.set(
      worldPos.x + offsetX,
      worldPos.y + offsetY,
      worldPos.z + offsetZ
    );
    
    // Initialize crumb data
    sprite.userData.age = 0;
    sprite.userData.lifetime = CRUMB_LIFETIME_MIN + Math.random() * (CRUMB_LIFETIME_MAX - CRUMB_LIFETIME_MIN);
    
    // Initial velocity (outward spray + slight upward) - simplified
    const velY = INITIAL_VELOCITY_Y_MIN + Math.random() * (INITIAL_VELOCITY_Y_MAX - INITIAL_VELOCITY_Y_MIN);
    const velAngle = Math.random() * Math.PI * 2;
    sprite.userData.velocityX = Math.cos(velAngle) * INITIAL_VELOCITY_SPREAD;
    sprite.userData.velocityY = velY;
    sprite.userData.velocityZ = Math.sin(velAngle) * INITIAL_VELOCITY_SPREAD;
    
    // Reset scale and opacity
    sprite.scale.set(CRUMB_SIZE, CRUMB_SIZE, 1);
    sprite.material.opacity = CRUMB_OPACITY_START;
    
    // Make visible and add to scene
    sprite.visible = true;
    if (!sprite.parent) {
      sceneRef.add(sprite);
    }
    
    // Track as active
    activeCrumbs.push(sprite);
  }
}

// ===========================================
// UPDATE LOOP
// ===========================================

/**
 * Updates all active crumb sprites
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function updateChocolateCrumbVfx(deltaTime) {
  if (!initialized) return;
  
  // Update each active crumb
  for (let i = activeCrumbs.length - 1; i >= 0; i--) {
    const sprite = activeCrumbs[i];
    const data = sprite.userData;
    
    // Update age
    data.age += deltaTime;
    
    // Calculate lifetime progress (0 to 1)
    const progress = data.age / data.lifetime;
    
    if (progress >= 1.0) {
      // Lifetime expired - return to pool
      sprite.visible = false;
      activeCrumbs.splice(i, 1);
      continue;
    }
    
    // Update velocity (apply gravity)
    data.velocityY += GRAVITY * deltaTime;
    
    // Update position (simplified - no rotation)
    sprite.position.x += data.velocityX * deltaTime;
    sprite.position.y += data.velocityY * deltaTime;
    sprite.position.z += data.velocityZ * deltaTime;
    
    // Update opacity (fades out) - no scale changes for performance
    sprite.material.opacity = CRUMB_OPACITY_START + (CRUMB_OPACITY_END - CRUMB_OPACITY_START) * progress;
  }
}

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Initialize the chocolate crumb VFX system
 * @param {THREE.Scene} scene - The Three.js scene
 */
export function initChocolateCrumbVfx(scene) {
  if (initialized) {
    console.warn('ChocolateCrumbVfx already initialized');
    return;
  }
  
  sceneRef = scene;
  createSpritePool();
  initialized = true;
  console.log('Chocolate Crumb VFX initialized');
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
  if (crumbTexture) {
    crumbTexture.dispose();
    crumbTexture = null;
  }
  
  // Dispose material
  if (crumbMaterial) {
    crumbMaterial.dispose();
    crumbMaterial = null;
  }
  
  spritePool = [];
  activeCrumbs = [];
  sceneRef = null;
  initialized = false;
}
