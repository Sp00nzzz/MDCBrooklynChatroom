/**
 * Cinematic "Opening Eyes / Waking Up" Transition
 * 
 * Effects stack:
 * 1. Oval/elliptical mask that expands (like an eye opening)
 * 2. Blur + brightness/contrast/saturation filter ramp
 * 3. Double-vision ghosting (subtle offset layer)
 * 4. Vignette overlay (radial gradient)
 * 
 * All DOM/CSS-based, no WebGL post-processing.
 */

// ============================================
// CONFIGURABLE PARAMETERS (tweak these!)
// ============================================
const CONFIG = {
  // Oval mask animation (multi-phase: peek, close, open)
  eyelidDurationMs: 3200,        // Total duration of eye opening sequence
  ovalStartWidth: 80,            // Starting oval width in vw (horizontal spread)
  ovalStartHeight: 0,            // Starting oval height in vh (fully closed)
  ovalPeekHeight: 8,             // How much eyes open on first peek (vh)
  ovalEndWidth: 200,             // Ending oval width (overshoot to ensure full clear)
  ovalEndHeight: 200,            // Ending oval height (overshoot to ensure full clear)
  
  // Phase timing (as percentage of total duration)
  peekEndTime: 0.25,             // When first peek reaches max (25%)
  closeEndTime: 0.40,            // When eyes close back (40%)
  finalOpenStart: 0.45,          // When final open begins (45%)
  
  // Blur/filter ramp
  blurStartPx: 22,               // Initial blur amount (18-26px recommended)
  blurDurationMs: 3400,          // How long blur takes to clear
  brightnessStart: 1.2,          // Initial brightness (1.15-1.25 recommended)
  contrastStart: 0.92,           // Initial contrast (0.9-0.97 recommended)
  saturationStart: 0.88,         // Initial saturation (0.85-0.95 recommended)
  
  // Ghosting/double-vision
  ghostOffsetPx: 4,              // Ghost layer offset in pixels (2-6px recommended)
  ghostOpacityStart: 0.22,       // Ghost layer starting opacity (0.18-0.25 recommended)
  ghostDurationMs: 2600,         // How long ghost effect lasts
  
  // Vignette
  vignetteOpacityStart: 0.4,     // Starting vignette opacity (0.35-0.45 recommended)
  vignetteOpacityEnd: 0.0,       // Ending vignette opacity (0 for clean, 0.12-0.18 for subtle)
  vignetteDurationMs: 3400,      // How long vignette takes to fade
};

// State
let transitionContainer = null;
let ovalMask = null;
let filterOverlay = null;
let ghostLayer = null;
let vignetteOverlay = null;
let isTransitionPlaying = false;
let isInitialized = false;

/**
 * Initialize the transition system
 * Creates all DOM elements needed for the effect
 * @param {Object} options - { targetElement: HTMLElement } - element to apply filter to
 */
export function initEyeOpenTransition(options = {}) {
  if (isInitialized) return;
  isInitialized = true;

  // Main container for all transition elements
  transitionContainer = document.createElement('div');
  transitionContainer.id = 'eye-open-transition';
  transitionContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2000;
    pointer-events: none;
    overflow: hidden;
    display: none;
  `;

  // ========================================
  // 1. OVAL MASK (elliptical eye opening)
  // Uses radial-gradient mask to create expanding oval hole
  // z-index: 1 (bottom layer - black eyelids)
  // ========================================
  ovalMask = document.createElement('div');
  ovalMask.id = 'oval-mask';
  ovalMask.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000000;
    z-index: 1;
    will-change: mask, -webkit-mask;
  `;
  // Initial mask will be set in resetToStartState()

  // ========================================
  // 2. FILTER OVERLAY (blur, brightness, contrast, saturation)
  // Applied via backdrop-filter for live canvas effect
  // z-index: 10 (above oval mask so blur is visible over black)
  // ========================================
  filterOverlay = document.createElement('div');
  filterOverlay.id = 'filter-overlay';
  filterOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    backdrop-filter: blur(${CONFIG.blurStartPx}px) brightness(${CONFIG.brightnessStart}) contrast(${CONFIG.contrastStart}) saturate(${CONFIG.saturationStart});
    -webkit-backdrop-filter: blur(${CONFIG.blurStartPx}px) brightness(${CONFIG.brightnessStart}) contrast(${CONFIG.contrastStart}) saturate(${CONFIG.saturationStart});
    will-change: backdrop-filter;
    z-index: 10;
  `;

  // ========================================
  // 3. GHOST LAYER (double-vision effect)
  // Subtle offset translucent layer
  // z-index: 11 (above filter overlay)
  // ========================================
  ghostLayer = document.createElement('div');
  ghostLayer.id = 'ghost-layer';
  ghostLayer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transform: translate(${CONFIG.ghostOffsetPx}px, ${CONFIG.ghostOffsetPx}px);
    opacity: ${CONFIG.ghostOpacityStart};
    will-change: transform, opacity;
    z-index: 11;
  `;

  // ========================================
  // 4. VIGNETTE OVERLAY (radial gradient)
  // z-index: 12 (top layer)
  // ========================================
  vignetteOverlay = document.createElement('div');
  vignetteOverlay.id = 'vignette-overlay';
  vignetteOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(
      ellipse at center,
      transparent 0%,
      transparent 40%,
      rgba(0, 0, 0, 0.3) 70%,
      rgba(0, 0, 0, 0.7) 100%
    );
    opacity: ${CONFIG.vignetteOpacityStart};
    will-change: opacity;
    z-index: 12;
  `;

  // Assemble: filter and ghost behind, vignette on top, oval mask on very top
  transitionContainer.appendChild(filterOverlay);
  transitionContainer.appendChild(ghostLayer);
  transitionContainer.appendChild(vignetteOverlay);
  transitionContainer.appendChild(ovalMask);

  document.body.appendChild(transitionContainer);
}

/**
 * Update the oval mask size
 * Creates an elliptical transparent hole in the center of a black overlay
 */
function updateOvalMask(widthVw, heightVh) {
  // Use radial-gradient as a mask to create an elliptical hole
  // The gradient goes from transparent (center) to black (edges)
  // We invert this logic: black overlay with transparent ellipse cutout
  const maskGradient = `radial-gradient(ellipse ${widthVw}vw ${heightVh}vh at 50% 50%, transparent 0%, transparent 50%, black 50%, black 100%)`;
  
  ovalMask.style.maskImage = maskGradient;
  ovalMask.style.webkitMaskImage = maskGradient;
  ovalMask.style.maskSize = '100% 100%';
  ovalMask.style.webkitMaskSize = '100% 100%';
}

/**
 * Play the cinematic eye-opening transition
 * @param {Object} options - { onComplete: Function } - callback when fully complete
 */
export function playEyeOpenTransition(options = {}) {
  const { onComplete } = options;

  // Prevent multiple simultaneous transitions
  if (isTransitionPlaying) {
    return;
  }

  if (!isInitialized) {
    initEyeOpenTransition();
  }

  isTransitionPlaying = true;

  // Reset all elements to starting state
  resetToStartState();

  // Show the container
  transitionContainer.style.display = 'block';

  // Start animation
  const startTime = performance.now();
  
  // Calculate the longest duration for completion callback
  const maxDuration = Math.max(
    CONFIG.eyelidDurationMs,
    CONFIG.blurDurationMs,
    CONFIG.ghostDurationMs,
    CONFIG.vignetteDurationMs
  );

  function animate(currentTime) {
    const elapsed = currentTime - startTime;

    // ========================================
    // OVAL MASK ANIMATION (eye opening with peek-close-open)
    // Phase 1: Eyes peek open slightly (0% -> peekEndTime)
    // Phase 2: Eyes close back (peekEndTime -> closeEndTime)
    // Phase 3: Eyes fully open (finalOpenStart -> 100%)
    // ========================================
    const ovalProgress = Math.min(elapsed / CONFIG.eyelidDurationMs, 1);
    
    let currentHeight;
    const currentWidth = CONFIG.ovalStartWidth + (CONFIG.ovalEndWidth - CONFIG.ovalStartWidth) * easeOutQuad(ovalProgress);
    
    if (ovalProgress < CONFIG.peekEndTime) {
      // Phase 1: Opening to peek
      const phaseProgress = ovalProgress / CONFIG.peekEndTime;
      const eased = easeOutQuad(phaseProgress);
      currentHeight = CONFIG.ovalStartHeight + (CONFIG.ovalPeekHeight - CONFIG.ovalStartHeight) * eased;
    } else if (ovalProgress < CONFIG.closeEndTime) {
      // Phase 2: Closing back down
      const phaseProgress = (ovalProgress - CONFIG.peekEndTime) / (CONFIG.closeEndTime - CONFIG.peekEndTime);
      const eased = easeInOutQuad(phaseProgress);
      currentHeight = CONFIG.ovalPeekHeight - (CONFIG.ovalPeekHeight - CONFIG.ovalStartHeight * 0.5) * eased;
    } else if (ovalProgress < CONFIG.finalOpenStart) {
      // Brief pause while nearly closed
      currentHeight = CONFIG.ovalStartHeight * 0.5;
    } else {
      // Phase 3: Final full opening
      const phaseProgress = (ovalProgress - CONFIG.finalOpenStart) / (1 - CONFIG.finalOpenStart);
      const eased = easeInOutQuart(phaseProgress);
      currentHeight = CONFIG.ovalStartHeight * 0.5 + (CONFIG.ovalEndHeight - CONFIG.ovalStartHeight * 0.5) * eased;
    }
    
    updateOvalMask(currentWidth, currentHeight);

    // ========================================
    // BLUR/FILTER ANIMATION
    // ========================================
    const filterProgress = Math.min(elapsed / CONFIG.blurDurationMs, 1);
    // Use ease-out for blur clearing (fast start, slow end feels like focusing)
    const filterEase = easeOutQuart(filterProgress);
    
    const currentBlur = CONFIG.blurStartPx * (1 - filterEase);
    const currentBrightness = CONFIG.brightnessStart + (1 - CONFIG.brightnessStart) * filterEase;
    const currentContrast = CONFIG.contrastStart + (1 - CONFIG.contrastStart) * filterEase;
    const currentSaturation = CONFIG.saturationStart + (1 - CONFIG.saturationStart) * filterEase;
    
    filterOverlay.style.backdropFilter = `blur(${currentBlur}px) brightness(${currentBrightness}) contrast(${currentContrast}) saturate(${currentSaturation})`;
    filterOverlay.style.webkitBackdropFilter = `blur(${currentBlur}px) brightness(${currentBrightness}) contrast(${currentContrast}) saturate(${currentSaturation})`;

    // ========================================
    // GHOST LAYER ANIMATION
    // ========================================
    const ghostProgress = Math.min(elapsed / CONFIG.ghostDurationMs, 1);
    const ghostEase = easeOutCubic(ghostProgress);
    
    const currentGhostOffset = CONFIG.ghostOffsetPx * (1 - ghostEase);
    const currentGhostOpacity = CONFIG.ghostOpacityStart * (1 - ghostEase);
    
    ghostLayer.style.transform = `translate(${currentGhostOffset}px, ${currentGhostOffset}px)`;
    ghostLayer.style.opacity = currentGhostOpacity;

    // ========================================
    // VIGNETTE ANIMATION
    // ========================================
    const vignetteProgress = Math.min(elapsed / CONFIG.vignetteDurationMs, 1);
    const vignetteEase = easeOutQuad(vignetteProgress);
    
    const currentVignetteOpacity = CONFIG.vignetteOpacityStart + 
      (CONFIG.vignetteOpacityEnd - CONFIG.vignetteOpacityStart) * vignetteEase;
    
    vignetteOverlay.style.opacity = currentVignetteOpacity;

    // Continue or finish
    if (elapsed < maxDuration) {
      requestAnimationFrame(animate);
    } else {
      // All animations complete - clean up
      finishTransition(onComplete);
    }
  }

  // Start the animation loop
  requestAnimationFrame(animate);
}

/**
 * Reset all elements to their starting (closed/blurred) state
 */
function resetToStartState() {
  // Oval mask at starting size (thin horizontal slit)
  updateOvalMask(CONFIG.ovalStartWidth, CONFIG.ovalStartHeight);
  
  // Filter at max blur
  filterOverlay.style.backdropFilter = `blur(${CONFIG.blurStartPx}px) brightness(${CONFIG.brightnessStart}) contrast(${CONFIG.contrastStart}) saturate(${CONFIG.saturationStart})`;
  filterOverlay.style.webkitBackdropFilter = `blur(${CONFIG.blurStartPx}px) brightness(${CONFIG.brightnessStart}) contrast(${CONFIG.contrastStart}) saturate(${CONFIG.saturationStart})`;
  
  // Ghost layer offset and visible
  ghostLayer.style.transform = `translate(${CONFIG.ghostOffsetPx}px, ${CONFIG.ghostOffsetPx}px)`;
  ghostLayer.style.opacity = CONFIG.ghostOpacityStart;
  
  // Vignette visible
  vignetteOverlay.style.opacity = CONFIG.vignetteOpacityStart;
}

/**
 * Clean up after transition completes
 */
function finishTransition(onComplete) {
  // Fade out entire container smoothly
  transitionContainer.style.transition = 'opacity 0.2s ease-out';
  transitionContainer.style.opacity = '0';
  
  setTimeout(() => {
    // Hide and reset
    transitionContainer.style.display = 'none';
    transitionContainer.style.opacity = '1';
    transitionContainer.style.transition = 'none';
    
    isTransitionPlaying = false;
    
    // Fire completion callback
    if (onComplete) {
      onComplete();
    }
  }, 200);
}

// ============================================
// EASING FUNCTIONS
// ============================================

/**
 * Quartic ease-in-out: very slow start/end, fast middle
 * Good for oval opening (feels like eyelids)
 */
function easeInOutQuart(t) {
  return t < 0.5
    ? 8 * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

/**
 * Quartic ease-out: fast start, very slow end
 * Good for blur clearing (feels like eye focusing)
 */
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * Cubic ease-out: fast start, slow end
 * Good for ghost layer decay
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Quadratic ease-out: moderate deceleration
 * Good for vignette fade
 */
function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Quadratic ease-in-out: smooth acceleration and deceleration
 * Good for closing eyes motion
 */
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Clean up and remove all transition elements from DOM
 * Call this if you need to fully dispose the transition system
 */
export function cleanupEyeOpenTransition() {
  if (transitionContainer && transitionContainer.parentNode) {
    transitionContainer.parentNode.removeChild(transitionContainer);
  }
  transitionContainer = null;
  ovalMask = null;
  filterOverlay = null;
  ghostLayer = null;
  vignetteOverlay = null;
  isInitialized = false;
  isTransitionPlaying = false;
}
