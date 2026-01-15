import * as THREE from 'three';

/**
 * Proximity-based audio system for NPCs
 * Handles distance-based volume and random playback intervals
 */

// Diddy audio state
let diddyAudio = null;
let audioListener = null;
let diddyNpc = null;
let diddyRandomPlayTimer = 0;
let diddyNextRandomPlayTime = 0;
let diddyInitialized = false;

// Kool-Aid Man audio state
let koolAidAudio = null;
let koolAidNpc = null;
let koolAidRandomPlayTimer = 0;
let koolAidNextRandomPlayTime = 0;
let koolAidInitialized = false;

// Audio parameters
const MIN_DISTANCE = 2.0;  // Inside this distance → max volume
const MAX_DISTANCE = 15.0;  // Outside this distance → silent
const MIN_RANDOM_INTERVAL = 6.0;  // Minimum seconds between random plays
const MAX_RANDOM_INTERVAL = 14.0;  // Maximum seconds between random plays
const VOLUME_SMOOTH_FACTOR = 0.1;  // Exponential smoothing factor (0-1, lower = smoother)

/**
 * Initialize proximity audio for Diddy NPC
 * @param {THREE.AudioListener} listener - Audio listener attached to camera
 * @param {NPCSprite} npc - The Diddy NPC sprite object
 */
export function initDiddyAudio(listener, npc) {
  if (diddyInitialized) {
    console.warn('Diddy audio already initialized');
    return;
  }

  if (!listener) {
    console.error('Audio listener is required for Diddy audio');
    return;
  }

  if (!npc) {
    console.warn('Diddy NPC not found - audio will not be initialized');
    return;
  }

  audioListener = listener;
  diddyNpc = npc;

  // Create positional audio attached to Diddy NPC sprite
  const audioLoader = new THREE.AudioLoader();
  diddyAudio = new THREE.PositionalAudio(listener);
  
  // Position audio at NPC location (relative to sprite, which is at NPC position)
  diddyAudio.position.set(0, 0, 0); // Relative to sprite parent
  
  // Load audio file
  audioLoader.load(
    '/Diddy.mp3',
    (buffer) => {
      diddyAudio.setBuffer(buffer);
      // Disable automatic distance model - we'll control volume manually for smooth ramping
      diddyAudio.setRefDistance(1);
      diddyAudio.setMaxDistance(MAX_DISTANCE * 2); // Set far enough to not interfere
      diddyAudio.setRolloffFactor(0); // Disable rolloff - we handle it manually
      diddyAudio.setLoop(false); // Play once, not looping
      diddyAudio.setVolume(0); // Start at 0, will be controlled by distance
      
      // Attach to NPC sprite (audio will follow NPC position automatically)
      diddyNpc.sprite.add(diddyAudio);
      
      // Schedule first random play
      scheduleDiddyRandomPlay();
      
      diddyInitialized = true;
      console.log('Diddy audio initialized successfully');
    },
    undefined,
    (error) => {
      console.error('Failed to load Diddy audio:', error);
    }
  );
}

/**
 * Initialize proximity audio for Kool-Aid Man NPC
 * @param {THREE.AudioListener} listener - Audio listener attached to camera
 * @param {NPCSprite} npc - The Kool-Aid Man NPC sprite object
 */
export function initKoolAidAudio(listener, npc) {
  if (koolAidInitialized) {
    console.warn('Kool-Aid Man audio already initialized');
    return;
  }

  if (!listener) {
    console.error('Audio listener is required for Kool-Aid Man audio');
    return;
  }

  if (!npc) {
    console.warn('Kool-Aid Man NPC not found - audio will not be initialized');
    return;
  }

  koolAidNpc = npc;

  // Create positional audio attached to Kool-Aid Man NPC sprite
  const audioLoader = new THREE.AudioLoader();
  koolAidAudio = new THREE.PositionalAudio(listener);
  
  // Position audio at NPC location (relative to sprite, which is at NPC position)
  koolAidAudio.position.set(0, 0, 0); // Relative to sprite parent
  
  // Load audio file
  audioLoader.load(
    '/ohyeah.mp3',
    (buffer) => {
      koolAidAudio.setBuffer(buffer);
      // Disable automatic distance model - we'll control volume manually for smooth ramping
      koolAidAudio.setRefDistance(1);
      koolAidAudio.setMaxDistance(MAX_DISTANCE * 2); // Set far enough to not interfere
      koolAidAudio.setRolloffFactor(0); // Disable rolloff - we handle it manually
      koolAidAudio.setLoop(false); // Play once, not looping
      koolAidAudio.setVolume(0); // Start at 0, will be controlled by distance
      
      // Attach to NPC sprite (audio will follow NPC position automatically)
      koolAidNpc.sprite.add(koolAidAudio);
      
      // Schedule first random play
      scheduleKoolAidRandomPlay();
      
      koolAidInitialized = true;
      console.log('Kool-Aid Man audio initialized successfully');
    },
    undefined,
    (error) => {
      console.error('Failed to load Kool-Aid Man audio:', error);
    }
  );
}

/**
 * Update proximity audio based on player distance and random playback timer
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {THREE.Vector3} playerPosition - Current player/camera position
 */
export function updateDiddyAudio(deltaTime, playerPosition) {
  if (!diddyInitialized || !diddyAudio || !diddyNpc) {
    return;
  }

  // PositionalAudio is attached to sprite, so it automatically follows NPC position
  // No need to manually update position

  // Calculate distance from player to Diddy NPC
  const distance = playerPosition.distanceTo(diddyNpc.position);

  // Calculate target volume based on distance
  let targetVolume = 0;
  if (distance <= MIN_DISTANCE) {
    targetVolume = 1.0; // Max volume when close
  } else if (distance >= MAX_DISTANCE) {
    targetVolume = 0.0; // Silent when far
  } else {
    // Linear interpolation between min and max distance
    const t = 1.0 - (distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
    targetVolume = Math.max(0, Math.min(1, t));
  }

  // Smooth volume ramping to prevent popping
  const currentVolume = diddyAudio.getVolume();
  const smoothedVolume = currentVolume + (targetVolume - currentVolume) * VOLUME_SMOOTH_FACTOR;
  diddyAudio.setVolume(smoothedVolume);

  // Update random playback timer
  diddyRandomPlayTimer += deltaTime;
  
  // Check if it's time for a random play
  if (diddyRandomPlayTimer >= diddyNextRandomPlayTime) {
    // Only play if not already playing
    if (!diddyAudio.isPlaying) {
      diddyAudio.play();
    }
    
    // Schedule next random play
    scheduleDiddyRandomPlay();
  }
}

/**
 * Update proximity audio for Kool-Aid Man based on player distance and random playback timer
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {THREE.Vector3} playerPosition - Current player/camera position
 */
export function updateKoolAidAudio(deltaTime, playerPosition) {
  if (!koolAidInitialized || !koolAidAudio || !koolAidNpc) {
    return;
  }

  // PositionalAudio is attached to sprite, so it automatically follows NPC position
  // No need to manually update position

  // Calculate distance from player to Kool-Aid Man NPC
  const distance = playerPosition.distanceTo(koolAidNpc.position);

  // Calculate target volume based on distance
  let targetVolume = 0;
  if (distance <= MIN_DISTANCE) {
    targetVolume = 1.0; // Max volume when close
  } else if (distance >= MAX_DISTANCE) {
    targetVolume = 0.0; // Silent when far
  } else {
    // Linear interpolation between min and max distance
    const t = 1.0 - (distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
    targetVolume = Math.max(0, Math.min(1, t));
  }

  // Smooth volume ramping to prevent popping
  const currentVolume = koolAidAudio.getVolume();
  const smoothedVolume = currentVolume + (targetVolume - currentVolume) * VOLUME_SMOOTH_FACTOR;
  koolAidAudio.setVolume(smoothedVolume);

  // Update random playback timer
  koolAidRandomPlayTimer += deltaTime;
  
  // Check if it's time for a random play
  if (koolAidRandomPlayTimer >= koolAidNextRandomPlayTime) {
    // Only play if not already playing
    if (!koolAidAudio.isPlaying) {
      koolAidAudio.play();
    }
    
    // Schedule next random play
    scheduleKoolAidRandomPlay();
  }
}

/**
 * Schedule the next random playback time for Diddy
 */
function scheduleDiddyRandomPlay() {
  const randomInterval = THREE.MathUtils.randFloat(MIN_RANDOM_INTERVAL, MAX_RANDOM_INTERVAL);
  diddyNextRandomPlayTime = randomInterval;
  diddyRandomPlayTimer = 0;
}

/**
 * Schedule the next random playback time for Kool-Aid Man
 */
function scheduleKoolAidRandomPlay() {
  const randomInterval = THREE.MathUtils.randFloat(MIN_RANDOM_INTERVAL, MAX_RANDOM_INTERVAL);
  koolAidNextRandomPlayTime = randomInterval;
  koolAidRandomPlayTimer = 0;
}
