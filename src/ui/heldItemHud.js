/**
 * HELD ITEM HUD MODULE
 * 
 * Displays the currently held item as a HUD sprite in the bottom-right corner.
 * Supports optional "handheld bob" animation while the player is moving.
 * Supports squeeze animation for items like baby oil bottle.
 * 
 * Exports:
 *   - showHeldItem(imagePath, skipAnimation)  : Display an item image in the HUD
 *   - hideHeldItem(skipAnimation)           : Hide the current held item
 *   - switchHeldItem(imagePath)  : Instantly switch to a new item without animation
 *   - updateHeldItemHud(dt, isMoving) : Update bob animation
 *   - triggerSqueezeAnimation() : Trigger a squeeze/pump animation
 */

import { isPushActive } from '../pushInteraction.js';

// ===========================================
// STATE
// ===========================================

let hudElement = null;
let bobTime = 0;
let currentImagePath = null;

// Squeeze animation state
let squeezeTime = 0;
let isSqueezing = false;
const SQUEEZE_COMPRESS_DURATION = 0.1; // 100ms to compress
const SQUEEZE_RETURN_DURATION = 0.2; // 200ms to return
const SQUEEZE_SCALE_X_MIN = 0.94; // Compress horizontally
const SQUEEZE_SCALE_Y_MAX = 1.03; // Expand vertically slightly
const SQUEEZE_ROTATION_MAX = 2; // Degrees wiggle

// Animation cancellation tokens
let switchToken = 0;
let pendingTimeouts = [];

// ===========================================
// DOM CREATION
// ===========================================

/**
 * Creates the HUD element if it doesn't exist
 */
function ensureHudElement() {
  if (hudElement) return hudElement;
  
  hudElement = document.createElement('div');
  hudElement.id = 'held-item-hud';
  
  // Style: fixed position, bottom-right, no pointer events
  Object.assign(hudElement.style, {
    position: 'fixed',
    right: '-50px',
    bottom: '-20px',
    pointerEvents: 'none',
    zIndex: '100',
    display: 'none',
    // Transform origin for bob animation
    transformOrigin: 'bottom right',
    // Smooth transitions for show/hide (slide up/down)
    transition: 'transform 0.3s ease-out',
    // Start off-screen below
    transform: 'translateY(100%)'
  });
  
  // Create the image element
  const img = document.createElement('img');
  img.id = 'held-item-image';
  img.draggable = false;
  Object.assign(img.style, {
    display: 'block',
    width: 'auto',
    height: '500px', // 30% larger (was 300px)
    maxWidth: '50vw',
    objectFit: 'contain',
    // Filter for slight stylization
    filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.3))'
  });
  
  hudElement.appendChild(img);
  document.body.appendChild(hudElement);
  
  return hudElement;
}

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Show a held item in the bottom-right HUD
 * @param {string} imagePath - Web path to the item image (e.g., "/babyoil.png")
 * @param {boolean} skipAnimation - If true, instantly show without pull-up animation
 */
export function showHeldItem(imagePath, skipAnimation = false) {
  // HARD SAFETY GUARD: Don't show if push is active
  if (isPushActive()) {
    return;
  }
  
  ensureHudElement();
  
  currentImagePath = imagePath;
  const img = hudElement.querySelector('#held-item-image');
  img.src = imagePath;
  
  // Reset bob animation
  bobTime = 0;
  
  // Show and slide up from bottom
  hudElement.style.display = 'block';
  
  if (skipAnimation) {
    // Instantly set to visible position without transition
    hudElement.style.transition = 'none';
    hudElement.style.transform = 'translateY(0)';
    // Force reflow, then restore transition
    hudElement.offsetHeight;
    hudElement.style.transition = 'transform 0.3s ease-out';
  } else {
    // Force reflow for transition
    hudElement.offsetHeight;
    hudElement.style.transform = 'translateY(0)';
  }
}

/**
 * Hide the held item HUD
 * @param {boolean} skipAnimation - If true, instantly hide without pull-down animation
 */
export function hideHeldItem(skipAnimation = false) {
  if (!hudElement) return;
  
  // Cancel pending animations when hiding
  if (skipAnimation) {
    cancelAllPendingAnimations();
  }
  
  const currentToken = ++switchToken;
  currentImagePath = null;
  
  if (skipAnimation) {
    // Instantly hide without transition
    hudElement.style.transition = 'none';
    hudElement.style.transform = 'translateY(100%)';
    hudElement.style.display = 'none';
    // Restore transition for future use
    const timeoutId = setTimeout(() => {
      if (currentToken === switchToken && hudElement) {
        hudElement.style.transition = 'transform 0.3s ease-out';
      }
    }, 0);
    pendingTimeouts.push(timeoutId);
  } else {
    // Slide down and hide after transition
    hudElement.style.transform = 'translateY(100%)';
    
    const timeoutId = setTimeout(() => {
      if (currentToken === switchToken && !currentImagePath && hudElement) {
        hudElement.style.display = 'none';
      }
    }, 300); // Match transition duration
    pendingTimeouts.push(timeoutId);
  }
}

/**
 * Cancel all pending animations and reset state
 * Prevents stale animations from affecting items after switches
 */
function cancelAllPendingAnimations() {
  // Cancel all pending timeouts
  pendingTimeouts.forEach(id => clearTimeout(id));
  pendingTimeouts = [];
  
  // Invalidate any pending animations
  switchToken++;
  
  // Reset animation states
  isSqueezing = false;
  squeezeTime = 0;
  bobTime = 0;
}

/**
 * Force the held item HUD into a known-good equipped state
 * Resets all transforms, positioning, and ensures correct visibility
 * This is the authoritative function that guarantees correct HUD state
 * 
 * OVERLAY FIX: Explicitly ensures camera is hidden when HUD is shown
 * to prevent z-index conflicts and visual overlap.
 */
function forceEquipState(imagePath) {
  if (!hudElement) ensureHudElement();
  
  // Cancel any pending animations first
  cancelAllPendingAnimations();
  const currentToken = ++switchToken;
  
  // CRITICAL: Ensure camera is hidden when HUD is shown
  // Check camera container directly to avoid circular dependency
  const cameraEl = document.getElementById('camera-view-container');
  if (cameraEl && cameraEl.style.display !== 'none') {
    cameraEl.style.transition = 'none';
    cameraEl.style.display = 'none';
    cameraEl.style.transform = 'translateY(100%)';
  }
  
  // FORCE HUD into visible, correctly positioned state
  currentImagePath = imagePath;
  const img = hudElement.querySelector('#held-item-image');
  img.src = imagePath;
  
  // Reset all animation states
  bobTime = 0;
  isSqueezing = false;
  squeezeTime = 0;
  
  // Remove any stale transforms or positioning
  hudElement.style.transition = 'none';
  hudElement.style.display = 'block';
  hudElement.style.transform = 'translateY(0)';
  hudElement.style.right = '-50px';
  hudElement.style.bottom = '-20px';
  hudElement.style.zIndex = '100'; // Ensure HUD z-index is correct
  
  // Force reflow to apply changes immediately
  hudElement.offsetHeight;
  
  // Restore transition for future animations
  hudElement.style.transition = 'transform 0.3s ease-out';
  
  // Guard: Verify the state is correct after a frame
  requestAnimationFrame(() => {
    if (currentToken === switchToken && hudElement && currentImagePath === imagePath) {
      // Ensure camera is still hidden
      const cameraEl = document.getElementById('camera-view-container');
      if (cameraEl && cameraEl.style.display !== 'none') {
        cameraEl.style.transition = 'none';
        cameraEl.style.display = 'none';
        cameraEl.style.transform = 'translateY(100%)';
      }
      
      // Double-check: if transform is wrong, fix it
      const computedStyle = window.getComputedStyle(hudElement);
      const transform = computedStyle.transform;
      const display = computedStyle.display;
      
      if (transform && transform !== 'none' && !transform.includes('translateY(0)') && !transform.includes('matrix(1, 0, 0, 1, 0, 0)')) {
        hudElement.style.transition = 'none';
        hudElement.style.transform = 'translateY(0)';
        hudElement.offsetHeight;
        hudElement.style.transition = 'transform 0.3s ease-out';
      }
      
      // Ensure HUD is visible
      if (display === 'none') {
        hudElement.style.display = 'block';
      }
    }
  });
}

/**
 * Switch from one held item to another instantly without animation
 * Used when switching between items (not unequipping to empty)
 * @param {string} imagePath - Web path to the new item image
 * @param {boolean} forceInstant - If true, always switch instantly even if no item is currently shown
 */
export function switchHeldItem(imagePath, forceInstant = false) {
  // HARD SAFETY GUARD: Don't switch if push is active (unless forceInstant is true and we're restoring)
  // Allow restoration during push end, but prevent normal switches
  if (isPushActive() && !forceInstant) {
    return;
  }
  
  ensureHudElement();
  
  // If no item is currently shown and not forcing instant, use normal show animation
  if (!currentImagePath && !forceInstant) {
    showHeldItem(imagePath);
    return;
  }
  
  // Use forceEquipState to guarantee correct state when switching
  forceEquipState(imagePath);
}

/**
 * Update the held item HUD animation
 * Adds a subtle bob effect while the player is moving
 * Also handles squeeze animation if active
 * 
 * @param {number} deltaTime - Time since last frame in seconds
 * @param {boolean} isMoving - Whether the player is currently moving
 */
export function updateHeldItemHud(deltaTime, isMoving) {
  if (!hudElement || !currentImagePath) return;
  
  // HARD SAFETY GUARD: If push is active, force-hide and return immediately
  if (isPushActive()) {
    hudElement.style.transition = 'none';
    hudElement.style.display = 'none';
    hudElement.style.transform = 'translateY(100%)';
    return;
  }
  
  // Guard: Don't update if item was switched (prevents stale animations)
  // This is checked implicitly by currentImagePath being set
  
  // Update squeeze animation
  let squeezeTransform = '';
  if (isSqueezing && squeezeTime > 0) {
    squeezeTime -= deltaTime;
    
    if (squeezeTime <= 0) {
      // Animation complete
      isSqueezing = false;
      squeezeTime = 0;
    } else {
      // Calculate squeeze progress
      const totalDuration = SQUEEZE_COMPRESS_DURATION + SQUEEZE_RETURN_DURATION;
      const progress = 1 - (squeezeTime / totalDuration);
      
      let scaleX = 1;
      let scaleY = 1;
      let rotate = 0;
      
      if (progress < SQUEEZE_COMPRESS_DURATION / totalDuration) {
        // Compression phase (quick)
        const compressProgress = progress / (SQUEEZE_COMPRESS_DURATION / totalDuration);
        // Ease-out for compression
        const eased = 1 - Math.pow(1 - compressProgress, 3);
        scaleX = 1 - (1 - SQUEEZE_SCALE_X_MIN) * eased;
        scaleY = 1 + (SQUEEZE_SCALE_Y_MAX - 1) * eased;
        rotate = (Math.random() - 0.5) * 2 * SQUEEZE_ROTATION_MAX * eased;
      } else {
        // Return phase (smooth)
        const returnProgress = (progress - SQUEEZE_COMPRESS_DURATION / totalDuration) / (SQUEEZE_RETURN_DURATION / totalDuration);
        // Ease-out for return
        const eased = 1 - Math.pow(1 - returnProgress, 2);
        scaleX = SQUEEZE_SCALE_X_MIN + (1 - SQUEEZE_SCALE_X_MIN) * eased;
        scaleY = SQUEEZE_SCALE_Y_MAX - (SQUEEZE_SCALE_Y_MAX - 1) * eased;
        rotate = (Math.random() - 0.5) * 2 * SQUEEZE_ROTATION_MAX * (1 - eased);
      }
      
      squeezeTransform = `scale(${scaleX}, ${scaleY}) rotate(${rotate}deg)`;
    }
  }
  
  // Update bob animation
  let bobTransform = '';
  if (isMoving) {
    // Accumulate bob time
    bobTime += deltaTime * 8; // Bob frequency
    
    // Calculate bob offsets (subtle movement)
    const bobX = Math.sin(bobTime) * 3; // Horizontal sway (pixels)
    const bobY = Math.abs(Math.sin(bobTime * 2)) * 5; // Vertical bob (pixels)
    const bobRotate = Math.sin(bobTime * 0.7) * 1.5; // Slight rotation (degrees)
    
    bobTransform = `translate(${bobX}px, ${-bobY}px) rotate(${bobRotate}deg)`;
  } else {
    // Smoothly return to rest position
    bobTime *= 0.9; // Decay
    
    if (bobTime > 0.01) {
      const bobX = Math.sin(bobTime) * 3 * (bobTime / 10);
      const bobY = Math.abs(Math.sin(bobTime * 2)) * 5 * (bobTime / 10);
      const bobRotate = Math.sin(bobTime * 0.7) * 1.5 * (bobTime / 10);
      bobTransform = `translate(${bobX}px, ${-bobY}px) rotate(${bobRotate}deg)`;
    } else {
      bobTime = 0;
    }
  }
  
  // Combine transforms: base position + squeeze + bob
  const transforms = ['translateY(0)'];
  if (squeezeTransform) transforms.push(squeezeTransform);
  if (bobTransform) transforms.push(bobTransform);
  
  hudElement.style.transform = transforms.join(' ');
}

/**
 * Check if an item is currently being shown
 * @returns {boolean}
 */
export function isHeldItemVisible() {
  return currentImagePath !== null;
}

/**
 * Change the held item image without show/hide transition
 * Useful for animation frames (e.g., squeeze animation)
 * @param {string} imagePath - Web path to the new image
 */
export function setHeldItemImage(imagePath) {
  if (!hudElement) return;
  
  const img = hudElement.querySelector('#held-item-image');
  if (img) {
    img.src = imagePath;
  }
}

/**
 * Trigger a squeeze/pump animation on the held item
 * Creates a quick compress and smooth return effect
 * Can be called multiple times for repeated pumps
 */
export function triggerSqueezeAnimation() {
  if (!hudElement || !currentImagePath) return;
  
  // Reset and start squeeze animation
  isSqueezing = true;
  squeezeTime = SQUEEZE_COMPRESS_DURATION + SQUEEZE_RETURN_DURATION;
}
