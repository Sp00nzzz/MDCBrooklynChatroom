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

import { showHeldItem, hideHeldItem, updateHeldItemHud } from '../ui/heldItemHud.js';

// ===========================================
// CONSTANTS
// ===========================================

const SMOKING_IMAGE = '/smoking1.png';
const SMOKING2_IMAGE = '/smoking2.png';
const SMOKING2_DURATION = 1.0; // Seconds to show smoking2

// ===========================================
// STATE
// ===========================================

let initialized = false;
let isSelected = false;
let smoking2Timer = 0;
let smoking2Element = null;

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
 */
export function setSelected(selected) {
  if (isSelected === selected) return;

  isSelected = selected;

  if (isSelected) {
    // Show the smoking hand HUD
    showHeldItem(SMOKING_IMAGE);
  } else {
    // Hide the HUD
    hideHeldItem();
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
 * Handle click - hide hand and show smoking2 for 1 second
 */
export function handleClick() {
  if (!isSelected || !initialized) return;
  
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
}
