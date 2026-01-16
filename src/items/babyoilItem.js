/**
 * BABY OIL ITEM MODULE
 * 
 * When baby oil is selected in the hotbar:
 * - Shows baby oil bottle HUD in bottom-right
 * - Holding left-click "squeezes" and spawns white splat decals on surfaces
 * 
 * Exports:
 *   - initBabyOil({ scene, camera, raycastTargets })
 *   - setSelected(isSelected)
 *   - update(dt, isMoving)
 *   - setSqueezing(bool)
 *   - cleanup()
 */

import * as THREE from 'three';
import { showHeldItem, hideHeldItem, updateHeldItemHud, setHeldItemImage, triggerSqueezeAnimation } from '../ui/heldItemHud.js';
import { triggerSquirt } from '../vfx/oilSquirtVfx.js';

// ===========================================
// CONSTANTS
// ===========================================

const HAND_IDLE_IMAGE = '/hand1oil.png';
const HAND_SQUEEZE_IMAGE = '/hand2oil.png';
const SQUEEZE_ANIMATION_DURATION = 0.7; // Seconds to show squeeze image
const SPLAT_SOUND_PATH = '/splat.mp3';

// Splat configuration
const SPLAT_RATE = 8; // Splats per second while squeezing
const SPLAT_COOLDOWN = 1 / SPLAT_RATE; // Seconds between splats
const MAX_SPLATS = 200; // Maximum splats in scene (FIFO removal)
const SPLAT_SIZE_MIN = 0.25;
const SPLAT_SIZE_MAX = 0.6;
const SPLAT_TEXTURE_POOL_SIZE = 6; // Number of pre-generated splat textures

// ===========================================
// STATE
// ===========================================

let initialized = false;
let isSelected = false;
let isSqueezing = false;
let squeezeCooldown = 0;

// Squeeze animation state
let squeezeAnimationTimer = 0;
let isShowingSqueezeImage = false;

// Splat sound
let splatSound = null;

// Three.js references
let sceneRef = null;
let cameraRef = null;
let raycastTargets = [];

// Raycaster for aiming
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0); // Center of screen in NDC

// Splat resources
let splatGeometry = null;
let splatTexturePool = [];
let splatMaterials = []; // One material per texture
let activeSplats = []; // Array of splat meshes currently in scene

// Crosshair element
let crosshairElement = null;

// ===========================================
// CROSSHAIR UI
// ===========================================

/**
 * Creates the crosshair DOM element if it doesn't exist
 */
function ensureCrosshair() {
  if (crosshairElement) return crosshairElement;
  
  crosshairElement = document.createElement('div');
  crosshairElement.id = 'babyoil-crosshair';
  
  // Style: centered, white crosshair
  Object.assign(crosshairElement.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex: '200',
    display: 'none',
    opacity: '0',
    transition: 'opacity 0.15s ease-out'
  });
  
  // Create crosshair using simple lines
  // Horizontal line
  const horizontal = document.createElement('div');
  Object.assign(horizontal.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '20px',
    height: '2px',
    backgroundColor: 'white',
    boxShadow: '0 0 4px rgba(0,0,0,0.5)'
  });
  
  // Vertical line
  const vertical = document.createElement('div');
  Object.assign(vertical.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '2px',
    height: '20px',
    backgroundColor: 'white',
    boxShadow: '0 0 4px rgba(0,0,0,0.5)'
  });
  
  // Center dot
  const dot = document.createElement('div');
  Object.assign(dot.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    backgroundColor: 'white',
    boxShadow: '0 0 4px rgba(0,0,0,0.5)'
  });
  
  crosshairElement.appendChild(horizontal);
  crosshairElement.appendChild(vertical);
  crosshairElement.appendChild(dot);
  
  document.body.appendChild(crosshairElement);
  
  return crosshairElement;
}

/**
 * Show the crosshair
 */
function showCrosshair() {
  ensureCrosshair();
  crosshairElement.style.display = 'block';
  // Force reflow for transition
  crosshairElement.offsetHeight;
  crosshairElement.style.opacity = '0.8';
}

/**
 * Hide the crosshair
 */
function hideCrosshair() {
  if (!crosshairElement) return;
  crosshairElement.style.opacity = '0';
  setTimeout(() => {
    if (crosshairElement && crosshairElement.style.opacity === '0') {
      crosshairElement.style.display = 'none';
    }
  }, 150);
}

// ===========================================
// TEXTURE GENERATION
// ===========================================

/**
 * Generates a random blobby splat texture using canvas
 * @returns {THREE.CanvasTexture} A procedurally generated splat texture
 */
function generateSplatTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Clear with transparency
  ctx.clearRect(0, 0, size, size);
  
  // Draw main blob
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Create a radial gradient for soft edges
  const gradient = ctx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  // Draw irregular blob shape
  ctx.fillStyle = gradient;
  ctx.beginPath();
  
  // Create blobby shape with random bezier curves
  const numPoints = 8 + Math.floor(Math.random() * 4);
  const angleStep = (Math.PI * 2) / numPoints;
  
  for (let i = 0; i < numPoints; i++) {
    const angle = i * angleStep;
    const nextAngle = (i + 1) * angleStep;
    
    // Random radius variation for organic shape
    const radius = (size / 2.5) * (0.6 + Math.random() * 0.4);
    const nextRadius = (size / 2.5) * (0.6 + Math.random() * 0.4);
    
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    const nextX = centerX + Math.cos(nextAngle) * nextRadius;
    const nextY = centerY + Math.sin(nextAngle) * nextRadius;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    }
    
    // Control points for bezier curve
    const cpAngle = angle + angleStep / 2;
    const cpRadius = radius * (0.8 + Math.random() * 0.4);
    const cpX = centerX + Math.cos(cpAngle) * cpRadius;
    const cpY = centerY + Math.sin(cpAngle) * cpRadius;
    
    ctx.quadraticCurveTo(cpX, cpY, nextX, nextY);
  }
  
  ctx.closePath();
  ctx.fill();
  
  // Add some smaller satellite splats
  const numSatellites = 3 + Math.floor(Math.random() * 5);
  for (let i = 0; i < numSatellites; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = (size / 3) + Math.random() * (size / 4);
    const satX = centerX + Math.cos(angle) * distance;
    const satY = centerY + Math.sin(angle) * distance;
    const satRadius = 3 + Math.random() * 8;
    
    const satGradient = ctx.createRadialGradient(
      satX, satY, 0,
      satX, satY, satRadius
    );
    satGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    satGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = satGradient;
    ctx.beginPath();
    ctx.arc(satX, satY, satRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Create Three.js texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  
  return texture;
}

/**
 * Initialize the pool of splat textures and materials
 */
function initSplatResources() {
  // Shared geometry for all splats
  splatGeometry = new THREE.PlaneGeometry(1, 1);
  
  // Generate texture pool
  for (let i = 0; i < SPLAT_TEXTURE_POOL_SIZE; i++) {
    const texture = generateSplatTexture();
    splatTexturePool.push(texture);
    
    // Create a material for this texture
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Polygon offset to prevent z-fighting with surfaces
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    splatMaterials.push(material);
  }
}

// ===========================================
// SPLAT SPAWNING
// ===========================================

/**
 * Spawns a splat decal at the given position and orientation
 * @param {THREE.Vector3} position - World position for the splat
 * @param {THREE.Vector3} normal - Surface normal at the hit point
 */
function spawnSplat(position, normal) {
  if (!sceneRef || !splatGeometry || splatMaterials.length === 0) return;
  
  // Remove oldest splat if at limit
  if (activeSplats.length >= MAX_SPLATS) {
    const oldSplat = activeSplats.shift();
    sceneRef.remove(oldSplat);
    // Note: We don't dispose geometry/material since they're shared
  }
  
  // Pick a random material from the pool
  const materialIndex = Math.floor(Math.random() * splatMaterials.length);
  const material = splatMaterials[materialIndex];
  
  // Create splat mesh
  const splat = new THREE.Mesh(splatGeometry, material);
  
  // Random size
  const size = SPLAT_SIZE_MIN + Math.random() * (SPLAT_SIZE_MAX - SPLAT_SIZE_MIN);
  splat.scale.set(size, size, 1);
  
  // Position slightly offset from surface to prevent z-fighting
  const offset = 0.01;
  splat.position.copy(position).addScaledVector(normal, offset);
  
  // Orient to face along the surface normal
  // Create a quaternion that rotates from +Z (plane default normal) to the surface normal
  const up = new THREE.Vector3(0, 0, 1);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(up, normal);
  splat.quaternion.copy(quaternion);
  
  // Add random rotation around the normal
  const randomRotation = Math.random() * Math.PI * 2;
  const rotationQuat = new THREE.Quaternion();
  rotationQuat.setFromAxisAngle(normal, randomRotation);
  splat.quaternion.premultiply(rotationQuat);
  
  // Add to scene and track
  sceneRef.add(splat);
  activeSplats.push(splat);
}

/**
 * Performs raycast from camera center and spawns a splat if surface is hit
 */
/**
 * Play the splat sound effect
 */
function playSplatSound() {
  // Create a new audio instance each time for overlapping sounds
  const sound = new Audio(SPLAT_SOUND_PATH);
  sound.volume = 0.5;
  sound.play().catch(err => {
    // Ignore autoplay errors
  });
}

function trySpawnSplatAtAim() {
  if (!cameraRef || raycastTargets.length === 0) return;

  // Update raycaster from camera center
  raycaster.setFromCamera(screenCenter, cameraRef);

  // Raycast against target surfaces
  const intersects = raycaster.intersectObjects(raycastTargets, true);

  if (intersects.length > 0) {
    const hit = intersects[0];
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    
    // Apply positional offset: LEFT by 20 pixels, UP by 15 pixels
    // Convert pixel offsets to world space using camera's view vectors
    const offsetLeft = -20; // LEFT (negative right direction)
    const offsetUp = 15;    // UP (positive up direction)
    
    // Calculate camera's right and up vectors in world space
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    const cameraForward = new THREE.Vector3();
    cameraRef.matrixWorld.extractBasis(cameraRight, cameraUp, cameraForward);
    
    // Convert pixel offsets to world space units
    // Approximate conversion: pixels to world units based on distance to hit point
    const distanceToHit = cameraRef.position.distanceTo(hit.point);
    const fovRad = cameraRef.fov * Math.PI / 180;
    const pixelToWorldScale = (2 * Math.tan(fovRad / 2) * distanceToHit) / window.innerHeight;
    
    // Calculate offset vector
    const offsetVector = new THREE.Vector3();
    offsetVector.addScaledVector(cameraRight, offsetLeft * pixelToWorldScale);
    offsetVector.addScaledVector(cameraUp, offsetUp * pixelToWorldScale);
    
    // Apply offset to hit point
    const offsetPosition = hit.point.clone().add(offsetVector);
    
    spawnSplat(offsetPosition, normal);
    
    // Play splat sound
    playSplatSound();
  }
}

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Initialize the baby oil item system
 * @param {Object} config
 * @param {THREE.Scene} config.scene - The Three.js scene
 * @param {THREE.Camera} config.camera - The player camera
 * @param {THREE.Object3D[]} config.raycastTargets - Array of objects to raycast against
 */
export function initBabyOil({ scene, camera, raycastTargets: targets }) {
  if (initialized) {
    console.warn('BabyOil already initialized');
    return;
  }
  
  sceneRef = scene;
  cameraRef = camera;
  raycastTargets = targets || [];
  
  // Initialize splat resources
  initSplatResources();
  
  initialized = true;
  console.log('Baby Oil item initialized');
}

/**
 * Set whether baby oil is currently selected in the hotbar
 * @param {boolean} selected
 */
export function setSelected(selected) {
  if (isSelected === selected) return;

  isSelected = selected;

  if (isSelected) {
    // Show the baby oil HUD (idle hand) and crosshair
    showHeldItem(HAND_IDLE_IMAGE);
    showCrosshair();
    // Reset animation state
    squeezeAnimationTimer = 0;
    isShowingSqueezeImage = false;
  } else {
    // Hide the HUD, crosshair, and stop squeezing
    hideHeldItem();
    hideCrosshair();
    isSqueezing = false;
    squeezeCooldown = 0;
    squeezeAnimationTimer = 0;
    isShowingSqueezeImage = false;
  }
}

/**
 * Set whether the player is currently squeezing (holding left-click)
 * Only works when baby oil is selected
 * @param {boolean} squeezing
 */
export function setSqueezing(squeezing) {
  if (!isSelected) {
    isSqueezing = false;
    return;
  }
  
  const wasSqueezing = isSqueezing;
  isSqueezing = squeezing;
  
  // On initial squeeze (mouse down), trigger immediate visual feedback
  // This ensures even a single tap produces a pump effect
  if (squeezing && !wasSqueezing) {
    // Trigger squeeze animation immediately
    triggerSqueezeAnimation();
    
    // Trigger oil squirt VFX immediately
    const crosshairX = window.innerWidth / 2;
    const crosshairY = window.innerHeight / 2;
    triggerSquirt(crosshairX, crosshairY);
    
    // Also spawn a splat immediately (no cooldown on first click)
    trySpawnSplatAtAim();
    squeezeCooldown = SPLAT_COOLDOWN;
  }
}

/**
 * Update the baby oil item each frame
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {boolean} isMoving - Whether the player is moving (for HUD bob)
 */
export function update(deltaTime, isMoving) {
  if (!initialized) return;

  // Update HUD animation
  if (isSelected) {
    updateHeldItemHud(deltaTime, isMoving);
    
    // Update squeeze animation timer
    if (isShowingSqueezeImage) {
      squeezeAnimationTimer -= deltaTime;
      if (squeezeAnimationTimer <= 0) {
        // Switch back to idle image
        setHeldItemImage(HAND_IDLE_IMAGE);
        isShowingSqueezeImage = false;
      }
    }
  }

  // Handle squeezing / splat spawning
  if (isSelected && isSqueezing) {
    squeezeCooldown -= deltaTime;

    if (squeezeCooldown <= 0) {
      trySpawnSplatAtAim();
      squeezeCooldown = SPLAT_COOLDOWN;
      
      // Trigger squeeze animation - show squeeze image
      if (!isShowingSqueezeImage) {
        setHeldItemImage(HAND_SQUEEZE_IMAGE);
        isShowingSqueezeImage = true;
      }
      // Reset/extend the animation timer on each splat
      squeezeAnimationTimer = SQUEEZE_ANIMATION_DURATION;
      
      // Trigger visual squeeze animation (bottle squish)
      triggerSqueezeAnimation();
      
      // Trigger oil squirt VFX (particles from bottle to crosshair)
      const crosshairX = window.innerWidth / 2;
      const crosshairY = window.innerHeight / 2;
      triggerSquirt(crosshairX, crosshairY);
    }
  } else {
    // Reset cooldown when not squeezing so first click is instant
    squeezeCooldown = 0;
    
    // On first click (when starting to squeeze), trigger immediate visual feedback
    // This ensures even a single tap produces a pump effect
    if (isSelected && !isSqueezing) {
      // This will be set to true on next frame when mousedown happens
      // We'll handle the initial pump in setSqueezing
    }
  }
}

/**
 * Check if baby oil is currently selected
 * @returns {boolean}
 */
export function isBabyOilSelected() {
  return isSelected;
}

/**
 * Clean up all splats and resources
 */
export function cleanup() {
  // Remove all active splats
  activeSplats.forEach(splat => {
    if (sceneRef) {
      sceneRef.remove(splat);
    }
  });
  activeSplats = [];

  // Dispose textures
  splatTexturePool.forEach(texture => texture.dispose());
  splatTexturePool = [];

  // Dispose materials
  splatMaterials.forEach(material => material.dispose());
  splatMaterials = [];

  // Dispose geometry
  if (splatGeometry) {
    splatGeometry.dispose();
    splatGeometry = null;
  }
  
  // Remove crosshair element
  if (crosshairElement && crosshairElement.parentNode) {
    crosshairElement.parentNode.removeChild(crosshairElement);
    crosshairElement = null;
  }

  initialized = false;
  isSelected = false;
  isSqueezing = false;
}

/**
 * Add raycast targets after initialization
 * @param {THREE.Object3D[]} targets - Additional objects to raycast against
 */
export function addRaycastTargets(targets) {
  raycastTargets.push(...targets);
}
