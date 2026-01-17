/**
 * CONFETTI VFX MODULE
 * 
 * Creates 3D world-space confetti that spawns when player wins.
 * Uses THREE.InstancedMesh for performance with 150-300 pieces per burst.
 * 
 * Exports:
 *   - initConfettiVfx(scene)
 *   - spawnWorldConfetti({ origin, count, duration })
 *   - updateWorldConfetti(deltaTime)
 *   - destroyWorldConfetti()
 */

import * as THREE from 'three';

// ===========================================
// CONSTANTS
// ===========================================

const DEFAULT_COUNT = 200; // Pieces per burst
const DEFAULT_DURATION = 2.5; // Seconds
const GRAVITY = -12.0; // Units per second squared
const DRIFT_STRENGTH = 1.5; // Horizontal drift speed
const SPIN_STRENGTH = 8.0; // Angular velocity (radians per second)
const DRAG = 0.3; // Air resistance (0-1, higher = more drag)
const SPAWN_SPREAD = 1.2; // Random spread radius around origin
const SPAWN_VELOCITY_UP = 4.0; // Initial upward velocity
const SPAWN_VELOCITY_HORIZONTAL = 2.5; // Initial horizontal velocity
const CONFETTI_SIZE = 0.12; // Size of each confetti piece (increased for visibility)

// ===========================================
// FLOOR COLLISION CONSTANTS
// ===========================================
// FLOOR DETECTION METHOD: Constant Y value
// The prison floor is a flat plane at Y = 0.0
// Source: prison.js line 50 - floor.position.set(0, -0.1, floorOffset)
//         floor uses BoxGeometry with height 0.2, so top surface is at -0.1 + 0.1 = 0.0
// This is a static, flat floor, so we use a constant FLOOR_Y value for efficient collision detection.
// No raycasting needed - simple Y comparison is sufficient and performant.
const FLOOR_Y = 0.0; // Floor surface Y position
const FLOOR_OFFSET = 0.008; // Small offset above floor to prevent z-fighting
const REST_DURATION = 3.0; // Seconds to rest on ground before starting despawn countdown
const LIFETIME_AFTER_LAND = 5.0; // Total seconds after landing before despawn
const LAND_SLIDE_DECAY = 0.85; // Horizontal velocity decay on landing (0-1, lower = more friction)
const LAND_SLIDE_DURATION = 0.2; // Seconds of sliding after landing

// Y2K celebratory colors (bright, vibrant)
const CONFETTI_COLORS = [
  new THREE.Color(0xff00ff), // Magenta
  new THREE.Color(0x00ffff), // Cyan
  new THREE.Color(0xffff00), // Yellow
  new THREE.Color(0xff0080), // Hot Pink
  new THREE.Color(0x00ff80), // Green
  new THREE.Color(0x0080ff), // Blue
  new THREE.Color(0xff8000), // Orange
  new THREE.Color(0x8000ff), // Purple
];

// ===========================================
// STATE
// ===========================================

let sceneRef = null;
let confettiMesh = null;
let confettiGeometry = null;
let confettiMaterial = null;
let initialized = false;

// Per-instance data arrays
let positions = [];
let velocities = [];
let rotations = [];
let spins = [];
let lifetimes = [];
let colors = [];
let states = []; // "AIR" | "LANDED"
let landTimes = []; // performance.now() timestamp when landed
let activeCount = 0;

// ===========================================
// INITIALIZATION
// ===========================================

/**
 * Initialize the confetti VFX system
 * @param {THREE.Scene} scene - The Three.js scene
 */
export function initConfettiVfx(scene) {
  if (initialized) {
    console.warn('ConfettiVfx already initialized');
    return;
  }

  sceneRef = scene;

  // Create geometry: small plane for each confetti piece
  confettiGeometry = new THREE.PlaneGeometry(CONFETTI_SIZE, CONFETTI_SIZE);
  
  // Add vertex colors to geometry (white, will be multiplied by instanceColor)
  const colors = new Float32Array(confettiGeometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = 1.0;     // R
    colors[i + 1] = 1.0; // G
    colors[i + 2] = 1.0; // B
  }
  confettiGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Create material: unlit, colorful, transparent
  // For InstancedMesh with instanceColor, we need vertexColors enabled
  // Don't set a base color - let instanceColor be the only color source
  confettiMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    vertexColors: true, // Enable per-instance colors
  });

  // Create InstancedMesh (will resize as needed)
  // Start with capacity for 300 pieces
  confettiMesh = new THREE.InstancedMesh(
    confettiGeometry,
    confettiMaterial,
    300
  );

  // Enable per-instance color
  // Create color array and set as instanceColor attribute
  const colorArray = new Float32Array(300 * 3);
  // Initialize with white (will be overwritten when spawning)
  for (let i = 0; i < 300; i++) {
    colorArray[i * 3] = 1.0;     // R
    colorArray[i * 3 + 1] = 1.0;  // G
    colorArray[i * 3 + 2] = 1.0;  // B
  }
  confettiMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);

  // Initially hide all instances
  confettiMesh.visible = false;
  confettiMesh.count = 0; // Start with 0 instances
  sceneRef.add(confettiMesh);

  initialized = true;
  console.log('Confetti VFX initialized');
}

// ===========================================
// SPAWNING
// ===========================================

/**
 * Spawns confetti burst in world space
 * @param {Object} options
 * @param {THREE.Vector3} options.origin - Spawn center position
 * @param {number} options.count - Number of pieces (default: DEFAULT_COUNT)
 * @param {number} options.duration - Lifetime in seconds (default: DEFAULT_DURATION)
 */
export function spawnWorldConfetti({ origin, count = DEFAULT_COUNT, duration = DEFAULT_DURATION }) {
  console.log('spawnWorldConfetti called with origin:', origin, 'count:', count);
  
  if (!initialized || !sceneRef || !confettiMesh) {
    console.warn('ConfettiVfx not initialized - initialized:', initialized, 'sceneRef:', !!sceneRef, 'confettiMesh:', !!confettiMesh);
    return;
  }

  // Destroy existing confetti if active (clears arrays and resets state)
  destroyWorldConfetti();
  console.log('After destroyWorldConfetti - activeCount:', activeCount, 'mesh visible:', confettiMesh.visible, 'mesh count:', confettiMesh.count);

  // Clamp count to reasonable range
  const pieceCount = Math.min(Math.max(count, 50), 300);

  // Ensure InstancedMesh has enough capacity
  // InstancedMesh has a fixed max count set in constructor (300 initially)
  // If we need more, recreate with larger capacity
  // Also check if instanceColor was lost (shouldn't happen, but safety check)
  const currentMaxCapacity = 300; // Initial capacity
  if (pieceCount > currentMaxCapacity || !confettiMesh.instanceColor) {
    console.log(`Recreating confetti mesh for ${pieceCount} pieces (current capacity: ${currentMaxCapacity})`);
    // Dispose old mesh
    sceneRef.remove(confettiMesh);
    confettiMesh.dispose();

    // Create new mesh with required capacity (round up to next 50 for safety)
    const newCapacity = Math.max(300, Math.ceil(pieceCount / 50) * 50);
    confettiMesh = new THREE.InstancedMesh(
      confettiGeometry,
      confettiMaterial,
      newCapacity
    );
    // Create and initialize color array
    const colorArray = new Float32Array(newCapacity * 3);
    for (let i = 0; i < newCapacity; i++) {
      colorArray[i * 3] = 1.0;
      colorArray[i * 3 + 1] = 1.0;
      colorArray[i * 3 + 2] = 1.0;
    }
    confettiMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    confettiMesh.visible = false; // Will be set to true after initialization
    confettiMesh.count = 0;
    sceneRef.add(confettiMesh);
  }

  // Reset arrays
  positions = [];
  velocities = [];
  rotations = [];
  spins = [];
  lifetimes = [];
  colors = [];
  states = [];
  landTimes = [];
  activeCount = pieceCount;
  
  // Get current time for tracking land times
  const spawnTime = performance.now();

  // Initialize each confetti piece
  for (let i = 0; i < pieceCount; i++) {
    // Random spawn position around origin
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * SPAWN_SPREAD;
    const height = (Math.random() - 0.5) * SPAWN_SPREAD * 0.5;

    positions.push(new THREE.Vector3(
      origin.x + Math.cos(angle) * radius,
      origin.y + height,
      origin.z + Math.sin(angle) * radius
    ));

    // Random initial velocity (upward burst + horizontal spread)
    const velAngle = Math.random() * Math.PI * 2;
    const velHorizontal = (Math.random() * 0.5 + 0.5) * SPAWN_VELOCITY_HORIZONTAL;
    velocities.push(new THREE.Vector3(
      Math.cos(velAngle) * velHorizontal,
      SPAWN_VELOCITY_UP * (0.7 + Math.random() * 0.6),
      Math.sin(velAngle) * velHorizontal
    ));

    // Random initial rotation
    rotations.push(new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    ));

    // Random spin (angular velocity)
    spins.push(new THREE.Vector3(
      (Math.random() - 0.5) * SPIN_STRENGTH,
      (Math.random() - 0.5) * SPIN_STRENGTH,
      (Math.random() - 0.5) * SPIN_STRENGTH
    ));

    // Random lifetime (not used for landed particles, but keep for compatibility)
    lifetimes.push(2.0 + Math.random() * 1.0);

    // Random color from palette
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    colors.push(color);
    
    // Initialize state as AIR
    states.push("AIR");
    landTimes.push(0); // Will be set when landed
  }

  // Ensure instanceColor array exists and is accessible
  if (!confettiMesh.instanceColor || !confettiMesh.instanceColor.array) {
    console.error('Confetti mesh instanceColor is missing! Recreating...');
    // Recreate instanceColor if missing
    const colorArray = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      colorArray[i * 3] = 1.0;
      colorArray[i * 3 + 1] = 1.0;
      colorArray[i * 3 + 2] = 1.0;
    }
    confettiMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
  }

  // Immediately set initial matrices and colors so confetti appears on first frame
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const colorArray = confettiMesh.instanceColor.array;
  
  for (let i = 0; i < pieceCount; i++) {
    // Set initial matrix
    quaternion.setFromEuler(rotations[i]);
    matrix.compose(positions[i], quaternion, new THREE.Vector3(1, 1, 1));
    confettiMesh.setMatrixAt(i, matrix);
    
    // Set initial color (ensure values are in 0-1 range)
    const color = colors[i];
    const idx = i * 3;
    // THREE.Color values are already 0-1, but ensure they're set correctly
    colorArray[idx] = color.r;
    colorArray[idx + 1] = color.g;
    colorArray[idx + 2] = color.b;
    
    // Debug first few colors
    if (i < 3) {
      console.log(`Confetti ${i} color:`, color.getHexString(), `RGB:`, color.r.toFixed(2), color.g.toFixed(2), color.b.toFixed(2));
    }
  }
  
  // Update instance count and mark for update
  confettiMesh.count = pieceCount;
  confettiMesh.instanceColor.needsUpdate = true;
  confettiMesh.instanceMatrix.needsUpdate = true;
  
  // Make mesh visible
  confettiMesh.visible = true;
  
  console.log(`Confetti spawned: ${pieceCount} pieces at`, origin);
  console.log(`Confetti mesh visible: ${confettiMesh.visible}, count: ${confettiMesh.count}, activeCount: ${activeCount}`);
  console.log(`First confetti position:`, positions[0]);
}

// ===========================================
// UPDATE LOOP
// ===========================================

/**
 * Updates all active confetti pieces
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function updateWorldConfetti(deltaTime) {
  if (!initialized || !confettiMesh || activeCount === 0) {
    return;
  }

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  let aliveCount = 0;
  const currentTime = performance.now();

  // Update each confetti piece
  for (let i = 0; i < activeCount; i++) {
    const state = states[i];
    const pos = positions[i];
    const vel = velocities[i];
    const rot = rotations[i];
    const spin = spins[i];
    const landTime = landTimes[i];

    // ===========================================
    // DESPAWN LOGIC (MANDATORY)
    // ===========================================
    if (state === "LANDED" && landTime > 0) {
      const timeSinceLand = (currentTime - landTime) / 1000; // Convert to seconds
      if (timeSinceLand >= LIFETIME_AFTER_LAND) {
        // Despawn: skip this particle
        continue;
      }
    }

    // ===========================================
    // COLLISION DETECTION & STATE MANAGEMENT
    // ===========================================
    if (state === "AIR") {
      // Predict next Y position
      const nextY = pos.y + vel.y * deltaTime;

      // Check floor collision
      if (nextY <= FLOOR_Y) {
        // COLLISION: Land on floor
        pos.y = FLOOR_Y + FLOOR_OFFSET; // Snap to floor with small offset
        
        // Zero out vertical velocity
        vel.y = 0;
        
        // Reduce horizontal velocity (slide decay)
        vel.x *= LAND_SLIDE_DECAY;
        vel.z *= LAND_SLIDE_DECAY;
        
        // Set state to LANDED
        states[i] = "LANDED";
        landTimes[i] = currentTime;
        
        // Reduce spin after landing (gradual stop)
        spin.x *= 0.7;
        spin.y *= 0.7;
        spin.z *= 0.7;
      } else {
        // Still in AIR: apply physics
        // Apply gravity
        vel.y += GRAVITY * deltaTime;

        // Apply horizontal drift (gentle noise-like movement)
        vel.x += (Math.random() - 0.5) * DRIFT_STRENGTH * deltaTime;
        vel.z += (Math.random() - 0.5) * DRIFT_STRENGTH * deltaTime;

        // Apply air drag
        vel.multiplyScalar(1 - DRAG * deltaTime);

        // Update position
        pos.x += vel.x * deltaTime;
        pos.y += vel.y * deltaTime;
        pos.z += vel.z * deltaTime;

        // Update rotation (spin)
        rot.x += spin.x * deltaTime;
        rot.y += spin.y * deltaTime;
        rot.z += spin.z * deltaTime;
      }
    } else if (state === "LANDED") {
      // ===========================================
      // BEHAVIOR AFTER LANDING
      // ===========================================
      const timeSinceLand = (currentTime - landTime) / 1000; // Convert to seconds
      
      // Do NOT apply gravity
      // Keep position fixed on floor
      pos.y = FLOOR_Y + FLOOR_OFFSET;
      
      // Optional: Apply tiny rotation decay (gradual stop)
      if (timeSinceLand < REST_DURATION) {
        // During rest period: slow down rotation
        spin.x *= (1 - deltaTime * 2); // Decay rotation
        spin.y *= (1 - deltaTime * 2);
        spin.z *= (1 - deltaTime * 2);
        
        // Apply remaining rotation
        rot.x += spin.x * deltaTime;
        rot.y += spin.y * deltaTime;
        rot.z += spin.z * deltaTime;
        
        // Optional: Tiny random slide for first 0.2s only
        if (timeSinceLand < LAND_SLIDE_DURATION) {
          const slideDecay = 1 - (timeSinceLand / LAND_SLIDE_DURATION);
          vel.x *= (1 - deltaTime * 3 * slideDecay);
          vel.z *= (1 - deltaTime * 3 * slideDecay);
          pos.x += vel.x * deltaTime;
          pos.z += vel.z * deltaTime;
        } else {
          // Stop horizontal movement after slide period
          vel.x = 0;
          vel.z = 0;
        }
      } else {
        // After rest period: fully static (no motion)
        vel.x = 0;
        vel.y = 0;
        vel.z = 0;
        spin.x = 0;
        spin.y = 0;
        spin.z = 0;
        // Rotation stays at current value (no further updates)
      }
    }

    // ===========================================
    // RENDER PARTICLE
    // ===========================================
    // Build transformation matrix
    quaternion.setFromEuler(rot);
    matrix.compose(pos, quaternion, new THREE.Vector3(1, 1, 1));

    // Set instance matrix
    confettiMesh.setMatrixAt(aliveCount, matrix);

    // Set instance color
    const color = colors[i];
    const colorArray = confettiMesh.instanceColor.array;
    const idx = aliveCount * 3;
    colorArray[idx] = color.r;
    colorArray[idx + 1] = color.g;
    colorArray[idx + 2] = color.b;

    aliveCount++;
  }

  // Update instance count (only render alive pieces)
  confettiMesh.count = aliveCount;
  if (aliveCount > 0) {
    confettiMesh.instanceColor.needsUpdate = true;
    confettiMesh.instanceMatrix.needsUpdate = true;
  }

  // If all pieces are despawned, hide mesh and cleanup
  // BUT keep the mesh ready for next spawn (don't destroy it)
  if (aliveCount === 0) {
    confettiMesh.visible = false;
    activeCount = 0;
    // Cleanup arrays (mesh stays ready for next spawn)
    positions = [];
    velocities = [];
    rotations = [];
    spins = [];
    lifetimes = [];
    colors = [];
    states = [];
    landTimes = [];
    // Reset instance count
    confettiMesh.count = 0;
  }
}

// ===========================================
// CLEANUP
// ===========================================

/**
 * Destroys all active confetti and cleans up
 */
export function destroyWorldConfetti() {
  if (!initialized || !confettiMesh) {
    return;
  }

  // Hide mesh
  confettiMesh.visible = false;

  // Clear arrays (but keep mesh ready for reuse)
  positions = [];
  velocities = [];
  rotations = [];
  spins = [];
  lifetimes = [];
  colors = [];
  states = [];
  landTimes = [];
  activeCount = 0;

  // Reset instance count (mesh stays in scene, ready for next spawn)
  confettiMesh.count = 0;
  
  // Mark matrices for update (even though count is 0)
  if (confettiMesh.instanceMatrix) {
    confettiMesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Clean up all resources (called on shutdown)
 */
export function cleanup() {
  destroyWorldConfetti();

  if (confettiMesh) {
    sceneRef?.remove(confettiMesh);
    confettiMesh.dispose();
    confettiMesh = null;
  }

  if (confettiGeometry) {
    confettiGeometry.dispose();
    confettiGeometry = null;
  }

  if (confettiMaterial) {
    confettiMaterial.dispose();
    confettiMaterial = null;
  }

  sceneRef = null;
  initialized = false;
}
