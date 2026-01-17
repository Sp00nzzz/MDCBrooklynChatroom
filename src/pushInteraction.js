/**
 * PUSH INTERACTION SYSTEM
 * 
 * Handles NPC push interactions triggered by pressing E when near an NPC.
 * Includes hand overlay animation and proximity detection.
 * 
 * Exports:
 *   - initPushInteraction(npcs, playerCamera) : Initialize the system
 *   - updatePushInteraction(deltaTime, playerPosition) : Update per frame
 *   - cleanupPushInteraction() : Cleanup on game end
 */

import * as THREE from 'three';
// Import item management functions
import { getSelectedItemType, getSelectedSlot } from './ui/hotbar.js';
import { setSelected as setBabyOilSelected } from './items/babyoilItem.js';
import { setSelected as setMarlboroSelected } from './items/marlboroItem.js';
import { hideHeldItem, showHeldItem, switchHeldItem } from './ui/heldItemHud.js';
import { isCameraViewEnabled, toggleCameraView } from './ui/cameraView.js';
import { getMasterVolume } from './ui/settings.js';
import { onNPCHitPush, isFightActive, canAddAngerFromPush } from './ui/angerSystem.js';

// ===========================================
// CONFIGURATION
// ===========================================

const PUSH_RADIUS = 1.75; // Distance to detect nearby NPCs (configurable: 1.5-2.0)
const PUSH_STRENGTH = 20.0; // Impulse strength (increased for stronger impact)
const PLAYER_COOLDOWN_MS = 400; // Cooldown between pushes (ms)
const NPC_COOLDOWN_MS = 500; // Cooldown per NPC (ms)

// ===========================================
// STATE
// ===========================================

let npcs = [];
let playerCamera = null;
let playerPosition = new THREE.Vector3();
let playerControls = null; // Pointer lock controls

// Input state
let eKeyPressed = false;
let eKeyWasPressed = false; // For edge detection

// Cooldown tracking
let playerPushCooldown = 0;

// Track last pushed NPC
let lastPushedNPC = null;

// UI elements
let handOverlay = null;
let hintText = null;
let animationFrameId = null;
let animationStartTime = 0;
let isAnimating = false;

// Item state tracking for push animation
let itemHiddenDuringPush = false;
let hiddenItemType = null;
let hiddenItemSlot = null;

// Authoritative push state (prevents hand/item from showing during push)
let isPushing = false;
let pushToken = 0;

// Reusable vectors for calculations
const tempVec1 = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();

// ===========================================
// HAND OVERLAY UI
// ===========================================

/**
 * Creates the hand push overlay element
 */
function createHandOverlay() {
  if (handOverlay) return;
  
  handOverlay = document.createElement('img');
  handOverlay.id = 'hand-push-overlay';
  handOverlay.src = '/HandPush.png';
  handOverlay.draggable = false;
  
  Object.assign(handOverlay.style, {
    position: 'fixed',
    left: '50%',
    bottom: '-10px', // Position at bottom of screen
    transform: 'translateX(-50%)', // Center horizontally
    pointerEvents: 'none',
    zIndex: '10000', // Very high z-index
    display: 'none',
    width: 'auto',
    height: '390px', // 30% bigger (300px * 1.3 = 390px)
    maxWidth: '58.5vw', // Also increase max width proportionally (45vw * 1.3 = 58.5vw)
    objectFit: 'contain',
    filter: 'drop-shadow(2px 4px 8px rgba(0,0,0,0.5))'
  });
  
  document.body.appendChild(handOverlay);
}

/**
 * Creates the hint text element
 */
function createHintText() {
  if (hintText) return;
  
  hintText = document.createElement('div');
  hintText.id = 'push-hint-text';
  hintText.textContent = 'Press E to push';
  
  Object.assign(hintText.style, {
    position: 'fixed',
    left: '50%',
    top: '60%',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    zIndex: '9999',
    display: 'none',
    color: '#ffffff',
    fontSize: '18px',
    fontFamily: 'Arial, sans-serif',
    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: '8px 16px',
    borderRadius: '4px',
    transition: 'opacity 0.2s ease-in-out'
  });
  
  document.body.appendChild(hintText);
}

/**
 * Force-hide all held visuals (hand + item HUD + camera)
 * Called at push start and enforced during push
 */
function forceHideHeldVisuals() {
  // Hide held item HUD (hand/item images)
  const hudEl = document.getElementById('held-item-hud');
  if (hudEl) {
    hudEl.style.transition = 'none';
    hudEl.style.display = 'none';
    hudEl.style.transform = 'translateY(100%)';
  }
  
  // Hide camera view container
  const cameraEl = document.getElementById('camera-view-container');
  if (cameraEl) {
    cameraEl.style.transition = 'none';
    cameraEl.style.display = 'none';
    cameraEl.style.transform = 'translateY(100%)';
  }
  
  // Cancel any item-related animations by calling hide functions with skipAnimation
  const currentItemType = getSelectedItemType();
  const currentSlot = getSelectedSlot();
  
  if (currentItemType === 'babyoil') {
    setBabyOilSelected(false, true); // Skip animation
  } else if (currentItemType === 'marlboro') {
    setMarlboroSelected(false, true); // Skip animation
  } else if (currentSlot === 1 && isCameraViewEnabled()) {
    toggleCameraView(true); // Skip animation
  } else if (currentItemType) {
    hideHeldItem(true); // Skip animation
  }
}

/**
 * Force-restore held visuals based on currently selected item
 * Called at push end - snaps to correct state without animations
 */
function forceRestoreHeldVisuals() {
  const activeItemType = getSelectedItemType();
  const activeSlot = getSelectedSlot();
  
  // If no item selected, keep visuals hidden
  if (!activeItemType && activeSlot !== 1) {
    return;
  }
  
  // Restore based on active item type
  if (activeItemType === 'babyoil') {
    // Restore baby oil - use switchHeldItem to snap to idle pose
    switchHeldItem('/hand1oil.png', true); // Force instant, no animation
    setBabyOilSelected(true, true); // Skip animation
  } else if (activeItemType === 'marlboro') {
    // Restore marlboro - use switchHeldItem to snap to idle pose
    switchHeldItem('/smoking1.png', true); // Force instant, no animation
    setMarlboroSelected(true, true); // Skip animation
  } else if (activeSlot === 1) {
    // Restore camera if slot 1 is selected
    // Check if camera should be enabled (slot 1 selected means camera should be up)
    const slot1Selected = getSelectedSlot() === 1;
    if (slot1Selected && !isCameraViewEnabled()) {
      // Camera should be enabled but isn't - restore it
      toggleCameraView(true); // Skip animation
    } else if (!slot1Selected && isCameraViewEnabled()) {
      // Camera is enabled but slot 1 is not selected - hide it
      toggleCameraView(true); // Skip animation
    } else if (slot1Selected && isCameraViewEnabled()) {
      // Camera is already correct - just ensure it's visible
      const cameraEl = document.getElementById('camera-view-container');
      if (cameraEl) {
        cameraEl.style.transition = 'none';
        cameraEl.style.display = 'block';
        cameraEl.style.transform = 'translateY(0)';
        cameraEl.offsetHeight; // Force reflow
        cameraEl.style.transition = 'transform 0.3s ease-out';
      }
    }
  }
  
  // Ensure HUD is visible if an item is selected (not camera)
  if (activeItemType && activeItemType !== 'camera') {
    const hudEl = document.getElementById('held-item-hud');
    if (hudEl) {
      hudEl.style.transition = 'none';
      hudEl.style.display = 'block';
      hudEl.style.transform = 'translateY(0)';
      hudEl.offsetHeight; // Force reflow
      hudEl.style.transition = 'transform 0.3s ease-out';
    }
  }
}

/**
 * Plays the hand push animation
 * Animation: pull up (0.2s) then pull down (0.2s), then hide
 */
function playHandPushAnimation() {
  if (!handOverlay) createHandOverlay();
  
  // Cancel any existing animation
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Set authoritative push state
  isPushing = true;
  const token = ++pushToken;
  
  // Store current item state for restoration
  hiddenItemType = getSelectedItemType();
  hiddenItemSlot = getSelectedSlot();
  itemHiddenDuringPush = true;
  
  // Force-hide all held visuals immediately
  forceHideHeldVisuals();
  
  // Reset to start state (at bottom, slightly offset down)
  handOverlay.style.display = 'block';
  handOverlay.style.opacity = '1';
  handOverlay.style.transform = 'translateX(-50%) translateY(30px)'; // Start slightly lower from bottom
  
  isAnimating = true;
  animationStartTime = performance.now();
  
  const UP_DURATION = 200; // 0.2s (200ms) to pull up
  const DOWN_DURATION = 200; // 0.2s (200ms) to pull down
  const TOTAL_DURATION = UP_DURATION + DOWN_DURATION; // 0.4s total
  
  function animate() {
    const elapsed = performance.now() - animationStartTime;
    
    if (elapsed >= TOTAL_DURATION) {
      // Animation complete - hide hand overlay
      handOverlay.style.display = 'none';
      isAnimating = false;
      animationFrameId = null;
      
      // Guard against late callbacks from previous pushes
      if (token !== pushToken) {
        return;
      }
      
      // Clear push state
      isPushing = false;
      
      // Restore held visuals (snaps to current item, no animations)
      if (itemHiddenDuringPush) {
        forceRestoreHeldVisuals();
        
        itemHiddenDuringPush = false;
        hiddenItemType = null;
        hiddenItemSlot = null;
      }
      
      return;
    }
    
    if (elapsed < UP_DURATION) {
      // Phase 1: Pull up (0ms to 200ms)
      const progress = elapsed / UP_DURATION;
      const easeOut = 1 - Math.pow(1 - progress, 3); // Ease out cubic
      const translateY = 30 - (40 * easeOut); // From +30px to -10px (relative to bottom)
      handOverlay.style.transform = `translateX(-50%) translateY(${translateY}px)`;
    } else {
      // Phase 2: Pull down (200ms to 400ms)
      const progress = (elapsed - UP_DURATION) / DOWN_DURATION;
      const easeIn = Math.pow(progress, 2); // Ease in quadratic
      const translateY = -10 + (50 * easeIn); // From -10px to +40px (relative to bottom)
      handOverlay.style.transform = `translateX(-50%) translateY(${translateY}px)`;
    }
    
    animationFrameId = requestAnimationFrame(animate);
  }
  
  animationFrameId = requestAnimationFrame(animate);
}

// ===========================================
// NPC PROXIMITY DETECTION
// ===========================================

/**
 * Finds the nearest NPC within push radius that the player is looking at
 * @param {THREE.Vector3} playerPos - Player position
 * @param {THREE.Camera} camera - Player camera (for view direction)
 * @returns {Object|null} { npc, distance } or null if none found
 */
function findNearestNPC(playerPos, camera) {
  let nearestNPC = null;
  let nearestDistance = PUSH_RADIUS;
  
  // Get camera forward direction (on XZ plane, ignore pitch)
  const cameraForward = new THREE.Vector3();
  if (camera) {
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0; // Project to XZ plane
    cameraForward.normalize();
  }
  
  // View angle threshold (cosine of max angle from center)
  // 60 degrees = cos(60°) ≈ 0.5, 45 degrees = cos(45°) ≈ 0.707
  const VIEW_ANGLE_THRESHOLD = 0.5; // ~60 degrees from center
  
  for (const npc of npcs) {
    // Calculate distance on XZ plane (ignore Y)
    tempVec1.set(npc.position.x, 0, npc.position.z);
    tempVec2.set(playerPos.x, 0, playerPos.z);
    const distance = tempVec1.distanceTo(tempVec2);
    
    // Check if NPC is within push radius and cooldown
    if (distance < nearestDistance && npc.pushCooldown <= 0) {
      // Check if player is looking at the NPC
      if (camera && cameraForward.lengthSq() > 0.1) {
        // Direction from player to NPC (on XZ plane)
        const toNPC = tempVec1.sub(tempVec2).normalize();
        
        // Dot product: 1.0 = directly ahead, 0.0 = 90 degrees, -1.0 = behind
        const dotProduct = cameraForward.dot(toNPC);
        
        // Only consider NPCs in front of player (within view angle)
        if (dotProduct >= VIEW_ANGLE_THRESHOLD) {
          nearestDistance = distance;
          nearestNPC = npc;
        }
      } else {
        // Fallback: if no camera, use old behavior
        nearestDistance = distance;
        nearestNPC = npc;
      }
    }
  }
  
  return nearestNPC ? { npc: nearestNPC, distance: nearestDistance } : null;
}

// ===========================================
// PUSH INTERACTION
// ===========================================

/**
 * Attempts to push the nearest NPC
 */
function attemptPush() {
  // Only allow push when pointer is locked (same as other interactions)
  if (!playerControls || !playerControls.isLocked) {
    return;
  }

  if (isFightActive()) {
    return;
  }
  
  // Check player cooldown
  if (playerPushCooldown > 0) {
    return;
  }
  
  // Find nearest NPC that player is looking at
  const nearest = findNearestNPC(playerPosition, playerCamera);
  if (!nearest) {
    return;
  }
  
  const npc = nearest.npc;
  
  // Check NPC cooldown
  if (npc.pushCooldown > 0) {
    return;
  }
  
  // Calculate push direction (from player to NPC, normalized)
  tempVec1.set(npc.position.x, 0, npc.position.z);
  tempVec2.set(playerPosition.x, 0, playerPosition.z);
  const direction = tempVec1.sub(tempVec2).normalize();
  
  // Apply push to NPC
  npc.applyPush(direction, PUSH_STRENGTH);
  
  // Set cooldowns
  playerPushCooldown = PLAYER_COOLDOWN_MS / 1000; // Convert to seconds
  npc.pushCooldown = NPC_COOLDOWN_MS / 1000;
  
  // Play hand animation
  playHandPushAnimation();
  
  // Play push sound effect
  playPushSound();

  // Track last pushed NPC
  lastPushedNPC = npc;

  if (canAddAngerFromPush()) {
    onNPCHitPush(npc.characterName || npc.id || 'npc');
  }
}

/**
 * Plays the push/shove sound effect
 */
function playPushSound() {
  try {
    const shoveSound = new Audio('/shove.mp3');
    shoveSound.volume = getMasterVolume(); // Respect master volume setting
    shoveSound.play().catch(error => {
      // Silently handle autoplay restrictions or missing file
      console.warn('Could not play push sound:', error);
    });
  } catch (error) {
    console.warn('Could not create push sound:', error);
  }
}

// ===========================================
// INPUT HANDLING
// ===========================================

/**
 * Handles E key press (edge detection)
 */
function handleKeyDown(event) {
  if (event.code === 'KeyE') {
    eKeyPressed = true;
  }
}

/**
 * Handles E key release
 */
function handleKeyUp(event) {
  if (event.code === 'KeyE') {
    eKeyPressed = false;
  }
}

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Initialize the push interaction system
 * @param {Array} npcsArray - Array of NPCSprite instances
 * @param {THREE.Camera} camera - Player camera
 * @param {Object} controls - Player controls (for pointer lock check)
 */
export function initPushInteraction(npcsArray, camera, controls) {
  npcs = npcsArray;
  playerCamera = camera;
  playerControls = controls;
  
  // Create UI elements
  createHandOverlay();
  createHintText();
  
  // Set up input handlers
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
}

/**
 * Update push interaction system (call every frame)
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {THREE.Vector3} playerPos - Current player position
 */
export function updatePushInteraction(deltaTime, playerPos) {
  playerPosition.copy(playerPos);
  
  // Update player cooldown
  if (playerPushCooldown > 0) {
    playerPushCooldown -= deltaTime;
    if (playerPushCooldown < 0) {
      playerPushCooldown = 0;
    }
  }
  
  // Edge detection for E key
  if (eKeyPressed && !eKeyWasPressed) {
    // E key was just pressed (edge)
    attemptPush();
  }
  eKeyWasPressed = eKeyPressed;
  
  // Update hint text visibility (only show when looking directly at NPC and pointer is locked)
  if (isFightActive()) {
    hintText.style.display = 'none';
    hintText.style.opacity = '0';
    return;
  }
  const nearest = findNearestNPC(playerPosition, playerCamera);
  if (nearest && playerPushCooldown <= 0 && playerControls && playerControls.isLocked) {
    hintText.style.display = 'block';
    hintText.style.opacity = '1';
  } else {
    hintText.style.display = 'none';
    hintText.style.opacity = '0';
  }
}

/**
 * Get whether push animation is currently active
 * @returns {boolean} True if push is active
 */
export function isPushActive() {
  return isPushing;
}

/**
 * Get the last NPC that was pushed
 * @returns {Object|null} The last pushed NPC or null
 */
export function getLastPushedNPC() {
  return lastPushedNPC;
}

/**
 * Cleanup push interaction system
 */
export function cleanupPushInteraction() {
  // Cancel animation
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Clear push state
  isPushing = false;
  pushToken = 0;
  
  // Remove event listeners
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('keyup', handleKeyUp);
  
  // Remove UI elements
  if (handOverlay && handOverlay.parentNode) {
    handOverlay.parentNode.removeChild(handOverlay);
    handOverlay = null;
  }
  
  if (hintText && hintText.parentNode) {
    hintText.parentNode.removeChild(hintText);
    hintText = null;
  }
  
  // Reset state
  npcs = [];
  playerCamera = null;
  playerControls = null;
  eKeyPressed = false;
  eKeyWasPressed = false;
  playerPushCooldown = 0;
  isAnimating = false;
}
