/**
 * MARLBORO ITEM MODULE
 * 
 * When marlboro is selected in the hotbar:
 * - Shows smoking hand HUD in bottom-right
 * - Clicking hides the hand and shows smoking2.png at bottom for 1 second
 * 
 * Exports:
 *   - initMarlboro()
 *   - setSelected(isSelected)
 *   - update(dt, isMoving)
 *   - handleClick()
 *   - cleanup()
 */

import { showHeldItem, hideHeldItem, updateHeldItemHud, switchHeldItem } from '../ui/heldItemHud.js';
import { isPushActive } from '../pushInteraction.js';

// ===========================================
// CONSTANTS
// ===========================================

const SMOKING_IMAGE = '/smoking1.png';
const SMOKING2_IMAGE = '/smoking2.png';
const SMOKING2_DURATION = 1.0; // Seconds to show smoking2
const SMOKE_SOUND_PATH = '/smoke.mp3';
const SMOKE_SOUND_COOLDOWN = 1.0; // Seconds between sound plays

// ===========================================
// STATE
// ===========================================

let initialized = false;
let isSelected = false;
let smoking2Timer = 0;
let smoking2Element = null;
let smokeSoundCooldown = 0;

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Initialize the marlboro item system
 */
export function initMarlboro() {
  if (initialized) {
    console.warn('Marlboro already initialized');
    return;
  }
  
  initialized = true;
  console.log('Marlboro item initialized');
}

/**
 * Set whether marlboro is currently selected in the hotbar
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
    // Show the smoking hand HUD
    if (skipAnimation) {
      switchHeldItem(SMOKING_IMAGE, true); // Force instant switch
    } else {
      showHeldItem(SMOKING_IMAGE);
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
 * Creates the smoking2 UI element if it doesn't exist
 */
function ensureSmoking2Element() {
  if (smoking2Element) return smoking2Element;
  
  smoking2Element = document.createElement('div');
  smoking2Element.id = 'marlboro-smoking2';
  
  // Style: fixed position, bottom center
  Object.assign(smoking2Element.style, {
    position: 'fixed',
    bottom: '0px',
    left: '50%',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    zIndex: '200',
    display: 'none'
  });
  
  // Create the image element
  const img = document.createElement('img');
  img.src = SMOKING2_IMAGE;
  img.draggable = false;
  Object.assign(img.style, {
    display: 'block',
    width: 'auto',
    height: '390px', // 30% bigger than 300px (300 * 1.3 = 390)
    maxWidth: '50vw',
    objectFit: 'contain',
    filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.5))'
  });
  
  smoking2Element.appendChild(img);
  document.body.appendChild(smoking2Element);
  
  return smoking2Element;
}

/**
 * Show smoking2.png at the bottom of the screen
 */
function showSmoking2() {
  ensureSmoking2Element();
  smoking2Element.style.display = 'block';
}

/**
 * Hide smoking2.png
 */
function hideSmoking2() {
  if (!smoking2Element) return;
  smoking2Element.style.display = 'none';
}

/**
 * Play the smoke sound effect
 */
function playSmokeSound() {
  // Check cooldown
  if (smokeSoundCooldown > 0) {
    return; // Still on cooldown
  }
  
  // Create and play sound
  const sound = new Audio(SMOKE_SOUND_PATH);
  sound.volume = 0.7;
  sound.play().catch(err => {
    // Ignore autoplay errors
    console.warn('Could not play smoke sound:', err);
  });
  
  // Set cooldown
  smokeSoundCooldown = SMOKE_SOUND_COOLDOWN;
}

/**
 * Handle click - hide hand and show smoking2 for 1 second
 */
export function handleClick() {
  if (!isSelected || !initialized) return;
  
  // Play smoke sound (with cooldown)
  playSmokeSound();
  
  // Hide the held item HUD
  hideHeldItem();
  
  // Show smoking2
  showSmoking2();
  
  // Reset timer
  smoking2Timer = SMOKING2_DURATION;
}

/**
 * Update the marlboro item each frame
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {boolean} isMoving - Whether the player is moving (for HUD bob)
 */
export function update(deltaTime, isMoving) {
  if (!initialized) return;
  
  // HARD SAFETY GUARD: If push is active, don't update visuals
  if (isPushActive()) {
    // Still update sound cooldown (non-visual)
    if (smokeSoundCooldown > 0) {
      smokeSoundCooldown -= deltaTime;
      if (smokeSoundCooldown < 0) {
        smokeSoundCooldown = 0;
      }
    }
    return;
  }

  // Update sound cooldown timer
  if (smokeSoundCooldown > 0) {
    smokeSoundCooldown -= deltaTime;
    if (smokeSoundCooldown < 0) {
      smokeSoundCooldown = 0;
    }
  }

  // Handle smoking2 timer
  if (smoking2Timer > 0) {
    smoking2Timer -= deltaTime;
    
    if (smoking2Timer <= 0) {
      // Timer expired - hide smoking2 and show smoking1 again
      hideSmoking2();
      if (isSelected) {
        showHeldItem(SMOKING_IMAGE);
      }
      smoking2Timer = 0;
    }
  } else if (isSelected) {
    // Update HUD animation (only if not showing smoking2)
    updateHeldItemHud(deltaTime, isMoving);
  }
}

/**
 * Check if marlboro is currently selected
 * @returns {boolean}
 */
export function isMarlboroSelected() {
  return isSelected;
}

/**
 * Clean up resources
 */
export function cleanup() {
  hideHeldItem();
  hideSmoking2();
  if (smoking2Element && smoking2Element.parentNode) {
    smoking2Element.parentNode.removeChild(smoking2Element);
    smoking2Element = null;
  }
  initialized = false;
  isSelected = false;
  smoking2Timer = 0;
  smokeSoundCooldown = 0;
}
