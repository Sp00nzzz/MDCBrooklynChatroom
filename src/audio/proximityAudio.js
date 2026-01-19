import * as THREE from 'three';
import { getMasterVolume } from '../ui/settings.js';

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

// 6ix9ine audio state
let sixix9ineAudio = null;
let sixix9ineNpc = null;
let sixix9ineRandomPlayTimer = 0;
let sixix9ineNextRandomPlayTime = 0;
let sixix9ineInitialized = false;

// Maduro audio state
let maduroAudio = null;
let maduroNpc = null;
let maduroRandomPlayTimer = 0;
let maduroNextRandomPlayTime = 0;
let maduroInitialized = false;

// Cohen audio state
let cohenAudio = null;
let cohenNpc = null;
let cohenRandomPlayTimer = 0;
let cohenNextRandomPlayTime = 0;
let cohenInitialized = false;

// Mr. Beast audio state
let mrBeastAudio = null;
let mrBeastNpc = null;
let mrBeastRandomPlayTimer = 0;
let mrBeastNextRandomPlayTime = 0;
let mrBeastInitialized = false;

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

  // Apply master volume multiplier
  targetVolume *= getMasterVolume();
  
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

  // Apply master volume multiplier
  targetVolume *= getMasterVolume();
  
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
 * Initialize proximity audio for 6ix9ine NPC
 * @param {THREE.AudioListener} listener - Audio listener attached to camera
 * @param {NPCSprite} npc - The 6ix9ine NPC sprite object
 */
export function init6ix9ineAudio(listener, npc) {
  if (sixix9ineInitialized) {
    console.warn('6ix9ine audio already initialized');
    return;
  }

  if (!listener) {
    console.error('Audio listener is required for 6ix9ine audio');
    return;
  }

  if (!npc) {
    console.warn('6ix9ine NPC not found - audio will not be initialized');
    return;
  }

  sixix9ineNpc = npc;

  // Create positional audio attached to 6ix9ine NPC sprite
  const audioLoader = new THREE.AudioLoader();
  sixix9ineAudio = new THREE.PositionalAudio(listener);
  
  // Position audio at NPC location (relative to sprite, which is at NPC position)
  sixix9ineAudio.position.set(0, 0, 0); // Relative to sprite parent
  
  // Load audio file
  audioLoader.load(
    '/6ix9ine.mp3',
    (buffer) => {
      sixix9ineAudio.setBuffer(buffer);
      // Disable automatic distance model - we'll control volume manually for smooth ramping
      sixix9ineAudio.setRefDistance(1);
      sixix9ineAudio.setMaxDistance(MAX_DISTANCE * 2); // Set far enough to not interfere
      sixix9ineAudio.setRolloffFactor(0); // Disable rolloff - we handle it manually
      sixix9ineAudio.setLoop(false); // Play once, not looping
      sixix9ineAudio.setVolume(0); // Start at 0, will be controlled by distance
      
      // Attach to NPC sprite (audio will follow NPC position automatically)
      sixix9ineNpc.sprite.add(sixix9ineAudio);
      
      // Schedule first random play
      schedule6ix9ineRandomPlay();
      
      sixix9ineInitialized = true;
      console.log('6ix9ine audio initialized successfully');
    },
    undefined,
    (error) => {
      console.error('Failed to load 6ix9ine audio:', error);
    }
  );
}

/**
 * Update proximity audio for 6ix9ine based on player distance and random playback timer
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {THREE.Vector3} playerPosition - Current player/camera position
 */
export function update6ix9ineAudio(deltaTime, playerPosition) {
  if (!sixix9ineInitialized || !sixix9ineAudio || !sixix9ineNpc) {
    return;
  }

  // PositionalAudio is attached to sprite, so it automatically follows NPC position
  // No need to manually update position

  // Calculate distance from player to 6ix9ine NPC
  const distance = playerPosition.distanceTo(sixix9ineNpc.position);

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

  // Apply master volume multiplier
  targetVolume *= getMasterVolume();
  
  // Smooth volume ramping to prevent popping
  const currentVolume = sixix9ineAudio.getVolume();
  const smoothedVolume = currentVolume + (targetVolume - currentVolume) * VOLUME_SMOOTH_FACTOR;
  sixix9ineAudio.setVolume(smoothedVolume);

  // Update random playback timer
  sixix9ineRandomPlayTimer += deltaTime;
  
  // Check if it's time for a random play
  if (sixix9ineRandomPlayTimer >= sixix9ineNextRandomPlayTime) {
    // Only play if not already playing
    if (!sixix9ineAudio.isPlaying) {
      sixix9ineAudio.play();
    }
    
    // Schedule next random play
    schedule6ix9ineRandomPlay();
  }
}

/**
 * Initialize proximity audio for Maduro NPC
 * @param {THREE.AudioListener} listener - Audio listener attached to camera
 * @param {NPCSprite} npc - The Maduro NPC sprite object
 */
export function initMaduroAudio(listener, npc) {
  if (maduroInitialized) {
    console.warn('Maduro audio already initialized');
    return;
  }

  if (!listener) {
    console.error('Audio listener is required for Maduro audio');
    return;
  }

  if (!npc) {
    console.warn('Maduro NPC not found - audio will not be initialized');
    return;
  }

  maduroNpc = npc;

  // Create positional audio attached to Maduro NPC sprite
  const audioLoader = new THREE.AudioLoader();
  maduroAudio = new THREE.PositionalAudio(listener);
  
  // Position audio at NPC location (relative to sprite, which is at NPC position)
  maduroAudio.position.set(0, 0, 0); // Relative to sprite parent
  
  // Load audio file
  audioLoader.load(
    '/maduro.mp3',
    (buffer) => {
      maduroAudio.setBuffer(buffer);
      // Disable automatic distance model - we'll control volume manually for smooth ramping
      maduroAudio.setRefDistance(1);
      maduroAudio.setMaxDistance(MAX_DISTANCE * 2); // Set far enough to not interfere
      maduroAudio.setRolloffFactor(0); // Disable rolloff - we handle it manually
      maduroAudio.setLoop(false); // Play once, not looping
      maduroAudio.setVolume(0); // Start at 0, will be controlled by distance
      
      // Attach to NPC sprite (audio will follow NPC position automatically)
      maduroNpc.sprite.add(maduroAudio);
      
      // Schedule first random play
      scheduleMaduroRandomPlay();
      
      maduroInitialized = true;
      console.log('Maduro audio initialized successfully');
    },
    undefined,
    (error) => {
      console.error('Failed to load Maduro audio:', error);
    }
  );
}

/**
 * Update proximity audio for Maduro based on player distance and random playback timer
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {THREE.Vector3} playerPosition - Current player/camera position
 */
export function updateMaduroAudio(deltaTime, playerPosition) {
  if (!maduroInitialized || !maduroAudio || !maduroNpc) {
    return;
  }

  // PositionalAudio is attached to sprite, so it automatically follows NPC position
  // No need to manually update position

  // Calculate distance from player to Maduro NPC
  const distance = playerPosition.distanceTo(maduroNpc.position);

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

  // Apply master volume multiplier
  targetVolume *= getMasterVolume();
  
  // Smooth volume ramping to prevent popping
  const currentVolume = maduroAudio.getVolume();
  const smoothedVolume = currentVolume + (targetVolume - currentVolume) * VOLUME_SMOOTH_FACTOR;
  maduroAudio.setVolume(smoothedVolume);

  // Update random playback timer
  maduroRandomPlayTimer += deltaTime;
  
  // Check if it's time for a random play
  if (maduroRandomPlayTimer >= maduroNextRandomPlayTime) {
    // Only play if not already playing
    if (!maduroAudio.isPlaying) {
      maduroAudio.play();
    }
    
    // Schedule next random play
    scheduleMaduroRandomPlay();
  }
}

/**
 * Initialize proximity audio for Cohen NPC
 * @param {THREE.AudioListener} listener - Audio listener attached to camera
 * @param {NPCSprite} npc - The Cohen NPC sprite object
 */
export function initCohenAudio(listener, npc) {
  if (cohenInitialized) {
    console.warn('Cohen audio already initialized');
    return;
  }

  if (!listener) {
    console.error('Audio listener is required for Cohen audio');
    return;
  }

  if (!npc) {
    console.warn('Cohen NPC not found - audio will not be initialized');
    return;
  }

  cohenNpc = npc;

  // Create positional audio attached to Cohen NPC sprite
  const audioLoader = new THREE.AudioLoader();
  cohenAudio = new THREE.PositionalAudio(listener);
  
  // Position audio at NPC location (relative to sprite, which is at NPC position)
  cohenAudio.position.set(0, 0, 0); // Relative to sprite parent
  
  // Load audio file
  audioLoader.load(
    '/cohen.mp3',
    (buffer) => {
      cohenAudio.setBuffer(buffer);
      // Disable automatic distance model - we'll control volume manually for smooth ramping
      cohenAudio.setRefDistance(1);
      cohenAudio.setMaxDistance(MAX_DISTANCE * 2); // Set far enough to not interfere
      cohenAudio.setRolloffFactor(0); // Disable rolloff - we handle it manually
      cohenAudio.setLoop(false); // Play once, not looping
      cohenAudio.setVolume(0); // Start at 0, will be controlled by distance
      
      // Attach to NPC sprite (audio will follow NPC position automatically)
      cohenNpc.sprite.add(cohenAudio);
      
      // Schedule first random play
      scheduleCohenRandomPlay();
      
      cohenInitialized = true;
      console.log('Cohen audio initialized successfully');
    },
    undefined,
    (error) => {
      console.error('Failed to load Cohen audio:', error);
    }
  );
}

/**
 * Update proximity audio for Cohen based on player distance and random playback timer
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {THREE.Vector3} playerPosition - Current player/camera position
 */
export function updateCohenAudio(deltaTime, playerPosition) {
  if (!cohenInitialized || !cohenAudio || !cohenNpc) {
    return;
  }

  // PositionalAudio is attached to sprite, so it automatically follows NPC position
  // No need to manually update position

  // Calculate distance from player to Cohen NPC
  const distance = playerPosition.distanceTo(cohenNpc.position);

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

  // Apply master volume multiplier
  targetVolume *= getMasterVolume();
  
  // Smooth volume ramping to prevent popping
  const currentVolume = cohenAudio.getVolume();
  const smoothedVolume = currentVolume + (targetVolume - currentVolume) * VOLUME_SMOOTH_FACTOR;
  cohenAudio.setVolume(smoothedVolume);

  // Update random playback timer
  cohenRandomPlayTimer += deltaTime;
  
  // Check if it's time for a random play
  if (cohenRandomPlayTimer >= cohenNextRandomPlayTime) {
    // Only play if not already playing
    if (!cohenAudio.isPlaying) {
      cohenAudio.play();
    }
    
    // Schedule next random play
    scheduleCohenRandomPlay();
  }
}

/**
 * Schedule the next random playback time for Kool-Aid Man
 */
function scheduleKoolAidRandomPlay() {
  const randomInterval = THREE.MathUtils.randFloat(MIN_RANDOM_INTERVAL, MAX_RANDOM_INTERVAL);
  koolAidNextRandomPlayTime = randomInterval;
  koolAidRandomPlayTimer = 0;
}

/**
 * Schedule the next random playback time for 6ix9ine
 */
function schedule6ix9ineRandomPlay() {
  const randomInterval = THREE.MathUtils.randFloat(MIN_RANDOM_INTERVAL, MAX_RANDOM_INTERVAL);
  sixix9ineNextRandomPlayTime = randomInterval;
  sixix9ineRandomPlayTimer = 0;
}

/**
 * Schedule the next random playback time for Maduro
 */
function scheduleMaduroRandomPlay() {
  const randomInterval = THREE.MathUtils.randFloat(MIN_RANDOM_INTERVAL, MAX_RANDOM_INTERVAL);
  maduroNextRandomPlayTime = randomInterval;
  maduroRandomPlayTimer = 0;
}

/**
 * Schedule the next random playback time for Cohen
 */
function scheduleCohenRandomPlay() {
  const randomInterval = THREE.MathUtils.randFloat(MIN_RANDOM_INTERVAL, MAX_RANDOM_INTERVAL);
  cohenNextRandomPlayTime = randomInterval;
  cohenRandomPlayTimer = 0;
}

/**
 * Initialize proximity audio for Mr. Beast NPC
 * @param {THREE.AudioListener} listener - Audio listener attached to camera
 * @param {NPCSprite} npc - The Mr. Beast NPC sprite object
 */
export function initMrBeastAudio(listener, npc) {
  if (mrBeastInitialized) {
    console.warn('Mr. Beast audio already initialized');
    return;
  }

  if (!listener) {
    console.error('Audio listener is required for Mr. Beast audio');
    return;
  }

  if (!npc) {
    console.warn('Mr. Beast NPC not found - audio will not be initialized');
    return;
  }

  mrBeastNpc = npc;

  // Create positional audio attached to Mr. Beast NPC sprite
  const audioLoader = new THREE.AudioLoader();
  mrBeastAudio = new THREE.PositionalAudio(listener);
  
  // Position audio at NPC location (relative to sprite, which is at NPC position)
  mrBeastAudio.position.set(0, 0, 0); // Relative to sprite parent
  
  // Load audio file
  audioLoader.load(
    '/beast.mp3',
    (buffer) => {
      mrBeastAudio.setBuffer(buffer);
      // Disable automatic distance model - we'll control volume manually for smooth ramping
      mrBeastAudio.setRefDistance(1);
      mrBeastAudio.setMaxDistance(MAX_DISTANCE * 2); // Set far enough to not interfere
      mrBeastAudio.setRolloffFactor(0); // Disable rolloff - we handle it manually
      mrBeastAudio.setLoop(false); // Play once, not looping
      mrBeastAudio.setVolume(0); // Start at 0, will be controlled by distance
      
      // Attach to NPC sprite (audio will follow NPC position automatically)
      mrBeastNpc.sprite.add(mrBeastAudio);
      
      // Schedule first random play
      scheduleMrBeastRandomPlay();
      
      mrBeastInitialized = true;
      console.log('Mr. Beast audio initialized successfully');
    },
    undefined,
    (error) => {
      console.error('Failed to load Mr. Beast audio:', error);
    }
  );
}

/**
 * Update proximity audio for Mr. Beast based on player distance and random playback timer
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {THREE.Vector3} playerPosition - Current player/camera position
 */
export function updateMrBeastAudio(deltaTime, playerPosition) {
  if (!mrBeastInitialized || !mrBeastAudio || !mrBeastNpc) {
    return;
  }

  // PositionalAudio is attached to sprite, so it automatically follows NPC position
  // No need to manually update position

  // Calculate distance from player to Mr. Beast NPC
  const distance = playerPosition.distanceTo(mrBeastNpc.position);

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

  // Apply master volume multiplier
  targetVolume *= getMasterVolume();
  
  // Smooth volume ramping to prevent popping
  const currentVolume = mrBeastAudio.getVolume();
  const smoothedVolume = currentVolume + (targetVolume - currentVolume) * VOLUME_SMOOTH_FACTOR;
  mrBeastAudio.setVolume(smoothedVolume);

  // Update random playback timer
  mrBeastRandomPlayTimer += deltaTime;
  
  // Check if it's time for a random play
  if (mrBeastRandomPlayTimer >= mrBeastNextRandomPlayTime) {
    // Only play if not already playing
    if (!mrBeastAudio.isPlaying) {
      mrBeastAudio.play();
    }
    
    // Schedule next random play
    scheduleMrBeastRandomPlay();
  }
}

/**
 * Schedule the next random playback time for Mr. Beast
 */
function scheduleMrBeastRandomPlay() {
  const randomInterval = THREE.MathUtils.randFloat(MIN_RANDOM_INTERVAL, MAX_RANDOM_INTERVAL);
  mrBeastNextRandomPlayTime = randomInterval;
  mrBeastRandomPlayTimer = 0;
}
