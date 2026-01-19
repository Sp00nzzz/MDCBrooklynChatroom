/**
 * CHOCOLATE CRUMB VFX 2D MODULE
 * 
 * Creates 2D DOM overlay chocolate crumb particles that appear on screen
 * when eating Feastables. Lightweight DOM-based effect.
 * 
 * Exports:
 *   - initChocolateCrumbVfx2D()
 *   - spawnChocolateCrumbs2D()
 *   - cleanup()
 */

// ===========================================
// CONSTANTS
// ===========================================

const CRUMBS_PER_BITE = 18; // Number of crumbs per bite
const MAX_CRUMBS_IN_OVERLAY = 120; // Max crumbs before cleanup
const CRUMB_SIZE_MIN = 3; // Minimum crumb size in px
const CRUMB_SIZE_MAX = 8; // Maximum crumb size in px
const CRUMB_DURATION_MIN = 450; // Minimum animation duration in ms
const CRUMB_DURATION_MAX = 900; // Maximum animation duration in ms
const CRUMB_DRIFT_X_MIN = -80; // Minimum horizontal drift in px
const CRUMB_DRIFT_X_MAX = 80; // Maximum horizontal drift in px
const CRUMB_FALL_Y_MIN = 60; // Minimum vertical fall in px
const CRUMB_FALL_Y_MAX = 140; // Maximum vertical fall in px
const CRUMB_SPAWN_SPREAD_X = 40; // Horizontal spawn spread
const CRUMB_SPAWN_SPREAD_Y = 30; // Vertical spawn spread

// Chocolate colors (dark brown to milk chocolate)
const CHOCOLATE_COLORS = [
  '#3b1f12', // Dark brown
  '#4a2a1a', // Medium dark brown
  '#5a3a2a', // Medium brown
  '#6a4a3a', // Light brown
  '#7a4a2e'  // Milk chocolate
];

// ===========================================
// STATE
// ===========================================

let overlayElement = null;
let initialized = false;

// ===========================================
// OVERLAY CREATION
// ===========================================

/**
 * Creates the VFX overlay container if it doesn't exist
 */
function ensureOverlay() {
  if (overlayElement) return overlayElement;
  
  overlayElement = document.createElement('div');
  overlayElement.id = 'vfx-overlay';
  
  Object.assign(overlayElement.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '250', // Above munch overlay (200) but below fight UI (10000)
    display: 'block'
  });
  
  document.body.appendChild(overlayElement);
  
  return overlayElement;
}

// ===========================================
// SCREEN ANCHOR
// ===========================================

/**
 * Gets the screen-space anchor point for spawning crumbs
 * Uses the munch overlay position as reference
 * @returns {{x: number, y: number}}
 */
export function getFeastablesScreenAnchor() {
  // Option A: Use munch overlay position if available
  const munchEl = document.getElementById('feastables-munch');
  if (munchEl && munchEl.style.display !== 'none') {
    const rect = munchEl.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height * 0.7 - 105 // Near the top of the munch image (mouth area), moved up then down
    };
  }
  
  // Option C: Fallback to lower-center area (hands/mouth region), moved up 175px
  return {
    x: window.innerWidth * 0.55,
    y: window.innerHeight * 0.62 - 105
  };
}

// ===========================================
// CRUMB SPAWNING
// ===========================================

/**
 * Spawns a single crumb particle
 * @param {number} startX - Starting X position
 * @param {number} startY - Starting Y position
 */
function spawnCrumb(startX, startY) {
  const overlay = ensureOverlay();
  
  // Cleanup if too many crumbs
  if (overlay.children.length > MAX_CRUMBS_IN_OVERLAY) {
    // Remove oldest crumbs (first half)
    const toRemove = Math.floor(overlay.children.length / 2);
    for (let i = 0; i < toRemove; i++) {
      if (overlay.firstChild) {
        overlay.removeChild(overlay.firstChild);
      }
    }
  }
  
  // Create crumb element
  const crumb = document.createElement('div');
  
  // Random properties
  const size = CRUMB_SIZE_MIN + Math.random() * (CRUMB_SIZE_MAX - CRUMB_SIZE_MIN);
  const color = CHOCOLATE_COLORS[Math.floor(Math.random() * CHOCOLATE_COLORS.length)];
  const duration = CRUMB_DURATION_MIN + Math.random() * (CRUMB_DURATION_MAX - CRUMB_DURATION_MIN);
  const driftX = CRUMB_DRIFT_X_MIN + Math.random() * (CRUMB_DRIFT_X_MAX - CRUMB_DRIFT_X_MIN);
  const fallY = CRUMB_FALL_Y_MIN + Math.random() * (CRUMB_FALL_Y_MAX - CRUMB_FALL_Y_MIN);
  const rotation = (Math.random() - 0.5) * 360; // -180 to 180 degrees
  
  // Initial position with spread
  const spawnX = startX + (Math.random() - 0.5) * CRUMB_SPAWN_SPREAD_X * 2;
  const spawnY = startY + (Math.random() - 0.5) * CRUMB_SPAWN_SPREAD_Y * 2;
  
  // Style crumb
  Object.assign(crumb.style, {
    position: 'absolute',
    left: `${spawnX}px`,
    top: `${spawnY}px`,
    width: `${size}px`,
    height: `${size}px`,
    backgroundColor: color,
    borderRadius: `${1 + Math.random() * 2}px`, // 1-3px rounding
    pointerEvents: 'none',
    transform: `translate3d(0, 0, 0) rotate(${rotation}deg) scale(1)`,
    opacity: '1',
    willChange: 'transform, opacity',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)' // Subtle shadow for depth
  });
  
  // Add subtle highlight (optional)
  if (Math.random() > 0.5) {
    crumb.style.boxShadow = 'inset 0 -1px 1px rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.3)';
  }
  
  overlay.appendChild(crumb);
  
  // Animate using requestAnimationFrame for smooth performance
  const startTime = performance.now();
  const startTransform = { x: 0, y: 0, rotation: rotation, scale: 1 };
  
  function animate() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    if (progress >= 1.0) {
      // Animation complete - remove element
      if (crumb.parentNode) {
        crumb.parentNode.removeChild(crumb);
      }
      return;
    }
    
    // Easing: ease-out for natural fall
    const easeOut = 1 - Math.pow(1 - progress, 3);
    
    // Calculate current transform
    const currentX = driftX * easeOut;
    const currentY = fallY * easeOut;
    const currentRotation = rotation + (driftX * 0.1 * easeOut); // Slight rotation based on drift
    const currentOpacity = 1 - progress; // Fade out
    
    // Apply transform (using translate3d for GPU acceleration)
    crumb.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) rotate(${currentRotation}deg) scale(${1 - progress * 0.2})`;
    crumb.style.opacity = currentOpacity.toString();
    
    requestAnimationFrame(animate);
  }
  
  // Start animation
  requestAnimationFrame(animate);
}

/**
 * Spawns chocolate crumb particles at the given screen position
 * @param {{x: number, y: number}} screenPos - Screen coordinates to spawn crumbs
 */
export function spawnChocolateCrumbs2D(screenPos) {
  if (!initialized) return;
  
  const anchor = screenPos || getFeastablesScreenAnchor();
  
  // Spawn multiple crumbs
  for (let i = 0; i < CRUMBS_PER_BITE; i++) {
    // Stagger spawn slightly for more natural burst
    setTimeout(() => {
      spawnCrumb(anchor.x, anchor.y);
    }, i * 5); // 5ms delay between each crumb
  }
}

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Initialize the 2D chocolate crumb VFX system
 */
export function initChocolateCrumbVfx2D() {
  if (initialized) {
    console.warn('ChocolateCrumbVfx2D already initialized');
    return;
  }
  
  ensureOverlay();
  initialized = true;
  console.log('Chocolate Crumb VFX 2D initialized');
}

/**
 * Clean up all resources
 */
export function cleanup() {
  if (overlayElement && overlayElement.parentNode) {
    overlayElement.parentNode.removeChild(overlayElement);
    overlayElement = null;
  }
  initialized = false;
}
