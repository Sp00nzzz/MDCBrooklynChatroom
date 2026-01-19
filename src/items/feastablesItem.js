/**
 * FEASTABLES ITEM MODULE
 * 
 * When feastables is selected in the hotbar:
 * - Shows feastables HUD in bottom-right
 * - Clicking hides the hand and shows feastableMunch.png with eating animation
 * 
 * Exports:
 *   - initFeastables()
 *   - setSelected(isSelected, skipAnimation)
 *   - update(dt, isMoving)
 *   - handleClick()
 *   - cleanup()
 */

import { showHeldItem, hideHeldItem, updateHeldItemHud, switchHeldItem } from '../ui/heldItemHud.js';
import { isPushActive } from '../pushInteraction.js';

// ===========================================
// CONSTANTS
// ===========================================

const FEASTABLES_IMAGE = '/feastablehand.png';
const MUNCH_IMAGE = '/feastableMunch.png';
const MUNCH_DURATION = 1.0; // Seconds to show munch animation
const USE_COOLDOWN = 1.0; // Seconds between uses (prevents spam)
const EATING_SOUND_PATH = '/EatingSound.mp3';
const EATING_SOUND_COOLDOWN = 1.0; // Seconds between sound plays

// ===========================================
// STATE
// ===========================================

let initialized = false;
let isSelected = false;
let munchTimer = 0;
let munchElement = null;
let useCooldown = 0;
let munchAnimationId = null;
let eatingSoundCooldown = 0;
let clickCount = 0; // Track clicks for Mr. Beast spawn

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Initialize the feastables item system
 */
export function initFeastables() {
  if (initialized) {
    console.warn('Feastables already initialized');
    return;
  }
  
  initialized = true;
  console.log('Feastables item initialized');
}

/**
 * Set whether feastables is currently selected in the hotbar
 * @param {boolean} selected
 * @param {boolean} skipAnimation - If true, skip pull-up/pull-down animation (for item switching)
 */
export function setSelected(selected, skipAnimation = false) {
  if (isSelected === selected) return;
  
  // If push is active, allow logical state change but don't show visuals
  if (isPushActive()) {
    isSelected = selected;
    return;
  }

  isSelected = selected;

  if (isSelected) {
    // Show the feastables HUD
    if (skipAnimation) {
      switchHeldItem(FEASTABLES_IMAGE, true); // Force instant switch
    } else {
      showHeldItem(FEASTABLES_IMAGE);
    }
  } else {
    // Hide the HUD
    // When switching items, we don't need to hide the old item - switchHeldItem handles it
    if (!skipAnimation) {
      hideHeldItem(false);
    }
  }
}

/**
 * Creates the munch UI element if it doesn't exist
 */
function ensureMunchElement() {
  if (munchElement) return munchElement;
  
  munchElement = document.createElement('div');
  munchElement.id = 'feastables-munch';
  
  // Style: fixed position, slightly below the bottom of the screen (30px)
  Object.assign(munchElement.style, {
    position: 'fixed',
    bottom: '-90px', // 30px below the bottom edge
    left: '50%',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    zIndex: '200',
    display: 'none'
  });
  
  // Create the image element
  const img = document.createElement('img');
  img.src = MUNCH_IMAGE;
  img.draggable = false;
  Object.assign(img.style, {
    display: 'block',
    width: 'auto',
    height: '390px', // Same size as smoking2
    maxWidth: '50vw',
    objectFit: 'contain',
    filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.5))',
    transform: 'scale(1.0)',
    opacity: '1',
    transition: 'none'
  });
  
  munchElement.appendChild(img);
  document.body.appendChild(munchElement);
  
  return munchElement;
}

/**
 * Show munch - just appear instantly
 */
function showMunch() {
  ensureMunchElement();
  const img = munchElement.querySelector('img');
  
  // Just show it immediately - no animation
  img.style.transform = 'scale(1.0)';
  img.style.opacity = '1';
  munchElement.style.display = 'block';
  
  // Set up timer to hide after duration (handled in update loop)
}

/**
 * Hide munch
 */
function hideMunch() {
  if (!munchElement) return;
  
  // Cancel any ongoing animation (if any)
  if (munchAnimationId !== null) {
    cancelAnimationFrame(munchAnimationId);
    munchAnimationId = null;
  }
  
  munchElement.style.display = 'none';
}

/**
 * Play the eating sound effect
 */
function playEatingSound() {
  // Check cooldown
  if (eatingSoundCooldown > 0) {
    return; // Still on cooldown
  }
  
  // Create and play sound
  const sound = new Audio(EATING_SOUND_PATH);
  sound.volume = 0.7;
  sound.play().catch(err => {
    // Ignore autoplay errors
    console.warn('Could not play eating sound:', err);
  });
  
  // Set cooldown
  eatingSoundCooldown = EATING_SOUND_COOLDOWN;
}

/**
 * Handle click - hide hand and show munch animation
 * @returns {boolean} - Returns true if this was the 4th click (should spawn Mr. Beast)
 */
export function handleClick() {
  if (!isSelected || !initialized) return false;
  
  // Check cooldown
  if (useCooldown > 0) {
    return false; // Still on cooldown
  }
  
  // Increment click counter
  clickCount++;
  const shouldSpawnMrBeast = clickCount === 4;
  
  // Play eating sound (with cooldown)
  playEatingSound();
  
  // Hide the held item HUD
  hideHeldItem();
  
  // Show munch animation
  showMunch();
  
  // Reset timer
  munchTimer = MUNCH_DURATION;
  
  // Set cooldown
  useCooldown = USE_COOLDOWN;
  
  return shouldSpawnMrBeast;
}

/**
 * Update the feastables item each frame
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {boolean} isMoving - Whether the player is moving (for HUD bob)
 */
export function update(deltaTime, isMoving) {
  if (!initialized) return;
  
  // HARD SAFETY GUARD: If push is active, don't update visuals
  if (isPushActive()) {
    // Still update cooldowns (non-visual)
    if (useCooldown > 0) {
      useCooldown -= deltaTime;
      if (useCooldown < 0) {
        useCooldown = 0;
      }
    }
    if (eatingSoundCooldown > 0) {
      eatingSoundCooldown -= deltaTime;
      if (eatingSoundCooldown < 0) {
        eatingSoundCooldown = 0;
      }
    }
    return;
  }

  // Update cooldown timers
  if (useCooldown > 0) {
    useCooldown -= deltaTime;
    if (useCooldown < 0) {
      useCooldown = 0;
    }
  }
  
  // Update sound cooldown timer
  if (eatingSoundCooldown > 0) {
    eatingSoundCooldown -= deltaTime;
    if (eatingSoundCooldown < 0) {
      eatingSoundCooldown = 0;
    }
  }

  // Handle munch timer
  if (munchTimer > 0) {
    munchTimer -= deltaTime;
    
    if (munchTimer <= 0) {
      // Timer expired - hide munch and show feastables hand again
      hideMunch();
      if (isSelected) {
        showHeldItem(FEASTABLES_IMAGE);
      }
      munchTimer = 0;
    }
  } else if (isSelected) {
    // Update HUD animation (only if not showing munch)
    updateHeldItemHud(deltaTime, isMoving);
  }
}

/**
 * Check if feastables is currently selected
 * @returns {boolean}
 */
export function isFeastablesSelected() {
  return isSelected;
}

/**
 * Get the current click count
 * @returns {number}
 */
export function getClickCount() {
  return clickCount;
}

/**
 * Reset the click count (for testing/debugging)
 */
export function resetClickCount() {
  clickCount = 0;
}

/**
 * Clean up resources
 */
export function cleanup() {
  hideHeldItem();
  hideMunch();
  if (munchElement && munchElement.parentNode) {
    munchElement.parentNode.removeChild(munchElement);
    munchElement = null;
  }
  if (munchAnimationId !== null) {
    cancelAnimationFrame(munchAnimationId);
    munchAnimationId = null;
  }
  initialized = false;
  isSelected = false;
  munchTimer = 0;
  useCooldown = 0;
  eatingSoundCooldown = 0;
}
