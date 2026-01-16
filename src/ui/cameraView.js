import * as THREE from 'three';
import { isPushActive } from '../pushInteraction.js';

/**
 * In-Game Handheld Camera UI
 * 
 * This module implements a camcorder-style UI overlay that shows a live preview
 * of what the player is seeing. It uses render-to-texture (RTT) to capture
 * the scene from the player's perspective and display it on a small screen.
 * 
 * HOW RENDER-TO-TEXTURE WORKS:
 * 1. We create a WebGLRenderTarget - this is an off-screen framebuffer
 * 2. We create a secondary camera that copies the main camera's transform
 * 3. Each frame (when enabled), we render the scene to the render target
 * 4. We then extract the pixel data and draw it to a canvas element
 * 5. This canvas is positioned inside the camera frame overlay
 * 
 * PERFORMANCE CONSIDERATIONS:
 * - The render target uses a LOW resolution (256x144) to minimize GPU cost
 * - Rendering ONLY happens when the camera UI is visible
 * - When disabled, no extra render passes occur
 */

// ============================================================================
// STATE
// ============================================================================

let isEnabled = false;
let renderer = null;
let scene = null;
let mainCamera = null;

// Render-to-texture components
let renderTarget = null;
let previewCamera = null;

// DOM elements
let containerElement = null;
let cameraFrameElement = null;
let previewCanvas = null;
let previewContext = null;
let scanlineOverlay = null;

// Animation cancellation tokens
let switchToken = 0;
let pendingTimeouts = [];
let pendingRAF = [];

// Preview resolution (16:9 aspect ratio, low resolution for performance)
const PREVIEW_WIDTH = 256;
const PREVIEW_HEIGHT = 144;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the camera view system
 * @param {THREE.WebGLRenderer} rendererInstance - The main Three.js renderer
 * @param {THREE.Scene} sceneInstance - The game scene
 * @param {THREE.PerspectiveCamera} mainCameraInstance - The player's camera
 */
export function initCameraView(rendererInstance, sceneInstance, mainCameraInstance) {
  renderer = rendererInstance;
  scene = sceneInstance;
  mainCamera = mainCameraInstance;

  // Create the WebGLRenderTarget for off-screen rendering
  // This acts as a framebuffer that we can render to instead of the screen
  renderTarget = new THREE.WebGLRenderTarget(PREVIEW_WIDTH, PREVIEW_HEIGHT, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    // No need for depth texture since we just want the color output
  });

  // Create a secondary camera that will copy the main camera's transform
  // This camera renders to our off-screen target
  previewCamera = new THREE.PerspectiveCamera(
    mainCamera.fov,      // Same FOV as main camera
    PREVIEW_WIDTH / PREVIEW_HEIGHT, // Aspect ratio of our preview
    mainCamera.near,     // Same near plane
    mainCamera.far       // Same far plane
  );

  // Create DOM elements for the UI
  createDOMElements();

  console.log('[CameraView] Initialized - Press E to toggle');
}

/**
 * Creates all DOM elements for the camera UI overlay
 */
function createDOMElements() {
  // Main container - positioned flush in the bottom right corner (no gaps)
  containerElement = document.createElement('div');
  containerElement.id = 'camera-view-container';
  containerElement.style.cssText = `
    position: fixed;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: 0;
    z-index: 1000;
    pointer-events: none;
    display: none;
    opacity: 1;
    transform: translateY(100%);
    transition: transform 0.3s ease-out;
    box-sizing: border-box;
  `;

  // Preview canvas - this displays the render-to-texture output
  // Positioned to appear "inside" the camera's screen area
  // The camera image has the screen on the left side, gray bezel frame
  // Scaled up proportionally: 1.5x (was 300px frame, now 450px)
  previewCanvas = document.createElement('canvas');
  previewCanvas.width = PREVIEW_WIDTH;
  previewCanvas.height = PREVIEW_HEIGHT;
  previewCanvas.style.cssText = `
    position: absolute;
    top: 84.5px;
    left: 24px;
    width: 255px;
    height: 180px;
    border-radius: 3px;
    image-rendering: auto;
    pointer-events: none;
  `;
  previewContext = previewCanvas.getContext('2d');

  // Scanline overlay for CRT effect (subtle, cheap)
  // Scaled up proportionally: 1.5x
  scanlineOverlay = document.createElement('div');
  scanlineOverlay.style.cssText = `
    position: absolute;
    top: 84.5px;
    left: 24px;
    width: 255px;
    height: 180px;
    border-radius: 3px;
    pointer-events: none;
    background: repeating-linear-gradient(
      0deg,
      rgba(0, 0, 0, 0.08) 0px,
      rgba(0, 0, 0, 0.08) 1px,
      transparent 1px,
      transparent 3px
    );
    mix-blend-mode: multiply;
  `;

  // Vignette overlay for subtle edge darkening
  // Scaled up proportionally: 1.5x
  const vignetteOverlay = document.createElement('div');
  vignetteOverlay.style.cssText = `
    position: absolute;
    top: 84.5px;
    left: 24px;
    width: 255px;
    height: 180px;
    border-radius: 3px;
    pointer-events: none;
    background: radial-gradient(
      ellipse at center,
      transparent 50%,
      rgba(0, 0, 0, 0.3) 100%
    );
  `;

  // Camera frame image - the Camera.png asset acts as the camcorder frame
  // Made bigger: 450px (was 300px) - 1.5x scale
  // Flush to bottom-right corner with no margins/padding
  cameraFrameElement = document.createElement('img');
  cameraFrameElement.src = '/camera.png'; // Vite serves public/ at root
  cameraFrameElement.alt = 'Camera';
  cameraFrameElement.style.cssText = `
    position: relative;
    width: 450px;
    height: auto;
    margin: 0;
    padding: 0;
    border: none;
    pointer-events: none;
    user-select: none;
    -webkit-user-drag: none;
    display: block;
  `;

  // REC indicator (blinking red dot) - positioned inside the screen area
  // Scaled up proportionally: 1.5x
  const recIndicator = document.createElement('div');
  recIndicator.style.cssText = `
    position: absolute;
    top: 115px;
    left: 55px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Courier New', monospace;
    font-size: 15px;
    font-weight: bold;
    color: #ff3333;
    text-shadow: 0 0 6px rgba(255, 0, 0, 0.5);
    pointer-events: none;
  `;

  const recDot = document.createElement('div');
  recDot.style.cssText = `
    width: 9px;
    height: 9px;
    background: #ff3333;
    border-radius: 50%;
    animation: recBlink 1s infinite;
    box-shadow: 0 0 6px rgba(255, 0, 0, 0.8);
  `;

  const recText = document.createElement('span');
  recText.textContent = 'REC';

  recIndicator.appendChild(recDot);
  recIndicator.appendChild(recText);

  // Add CSS animation for REC blink
  const style = document.createElement('style');
  style.textContent = `
    @keyframes recBlink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `;
  document.head.appendChild(style);

  // Assemble the UI hierarchy
  // Order matters: canvas first (behind), then overlays, then frame on top
  containerElement.appendChild(previewCanvas);
  containerElement.appendChild(scanlineOverlay);
  containerElement.appendChild(vignetteOverlay);
  containerElement.appendChild(cameraFrameElement);
  containerElement.appendChild(recIndicator);

  // Add to document
  document.body.appendChild(containerElement);
}

// ============================================================================
// ANIMATION CANCELLATION
// ============================================================================

/**
 * Cancel all pending animations, timeouts, and RAF callbacks
 * Prevents stale animations from affecting the camera after item switches
 */
function cancelAllPendingAnimations() {
  // Cancel all pending timeouts
  pendingTimeouts.forEach(id => clearTimeout(id));
  pendingTimeouts = [];
  
  // Note: We can't cancel RAF, but we increment switchToken to invalidate callbacks
  switchToken++;
}

// ============================================================================
// FORCE EQUIP STATE
// ============================================================================

/**
 * Force the camera into a known-good equipped state
 * Resets all transforms, positioning, and ensures correct parent/visibility
 * This is the authoritative function that guarantees correct camera state
 * 
 * ROOT CAUSE: When switching from Item 2/3 -> Item 1, the camera container
 * can have stale CSS transforms from previous animations or incomplete state
 * transitions. This function ensures it's always in the correct canonical state.
 * 
 * OVERLAY FIX: Explicitly ensures held item HUD is hidden when camera is shown
 * to prevent z-index conflicts and visual overlap.
 */
function forceEquipState(enabled) {
  if (!containerElement) return;
  
  // HARD SAFETY GUARD: If push is active, force-hide camera
  if (isPushActive()) {
    containerElement.style.transition = 'none';
    containerElement.style.display = 'none';
    containerElement.style.transform = 'translateY(100%)';
    return;
  }
  
  // Cancel any pending animations first
  cancelAllPendingAnimations();
  
  // CRITICAL: Ensure held item HUD is hidden when camera is shown
  // Use direct DOM check to avoid circular dependency and timing issues
  if (enabled) {
    const hudEl = document.getElementById('held-item-hud');
    if (hudEl) {
      // Force instant hide of held item HUD
      hudEl.style.transition = 'none';
      hudEl.style.display = 'none';
      hudEl.style.transform = 'translateY(100%)';
      // Clear any current image path state by removing the image src
      const img = hudEl.querySelector('#held-item-image');
      if (img) {
        img.src = '';
      }
    }
  }
  
  // Get current switch token to guard against delayed callbacks
  const currentToken = ++switchToken;
  
  if (enabled) {
    // FORCE camera into visible, correctly positioned state
    // Remove any stale transforms or positioning
    containerElement.style.transition = 'none';
    containerElement.style.display = 'block';
    containerElement.style.opacity = '1';
    containerElement.style.transform = 'translateY(0)';
    containerElement.style.right = '0';
    containerElement.style.bottom = '0';
    containerElement.style.margin = '0';
    containerElement.style.padding = '0';
    containerElement.style.zIndex = '1000'; // Ensure camera is on top
    
    // Force reflow to apply changes immediately
    containerElement.offsetHeight;
    
    // Restore transition for future animations (but not for this switch)
    containerElement.style.transition = 'transform 0.3s ease-out';
    
    // Guard: Verify the state is correct after a frame
    requestAnimationFrame(() => {
      if (currentToken === switchToken && containerElement && isEnabled) {
        // Double-check: if transform is wrong, fix it
        const computedStyle = window.getComputedStyle(containerElement);
        const transform = computedStyle.transform;
        const display = computedStyle.display;
        
        // Ensure held item HUD is still hidden
        const hudEl = document.getElementById('held-item-hud');
        if (hudEl && hudEl.style.display !== 'none') {
          hudEl.style.transition = 'none';
          hudEl.style.display = 'none';
          hudEl.style.transform = 'translateY(100%)';
        }
        
        // Fix camera transform if wrong
        if (transform && transform !== 'none' && !transform.includes('translateY(0)') && !transform.includes('matrix(1, 0, 0, 1, 0, 0)')) {
          containerElement.style.transition = 'none';
          containerElement.style.transform = 'translateY(0)';
          containerElement.offsetHeight;
          containerElement.style.transition = 'transform 0.3s ease-out';
        }
        
        // Ensure camera is visible
        if (display === 'none') {
          containerElement.style.display = 'block';
        }
      }
    });
  } else {
    // FORCE camera into hidden state
    containerElement.style.transition = 'none';
    containerElement.style.transform = 'translateY(100%)';
    containerElement.style.display = 'none';
    
    // Restore transition for future use
    const timeoutId = setTimeout(() => {
      if (currentToken === switchToken && containerElement) {
        containerElement.style.transition = 'transform 0.3s ease-out';
      }
    }, 0);
    pendingTimeouts.push(timeoutId);
  }
}

// ============================================================================
// TOGGLE
// ============================================================================

/**
 * Toggle the camera view ON or OFF
 * @param {boolean} skipAnimation - If true, instantly show/hide without animation (for item switching)
 * @returns {boolean} The new enabled state
 */
export function toggleCameraView(skipAnimation = false) {
  // If push is active, allow logical state change but don't show visuals
  if (isPushActive() && !skipAnimation) {
    isEnabled = !isEnabled;
    return isEnabled;
  }
  
  isEnabled = !isEnabled;

  if (skipAnimation) {
    // When switching items, use forceEquipState to guarantee correct state
    forceEquipState(isEnabled);
  } else {
    // Normal toggle with animation
    if (isEnabled) {
      // Show the camera UI with animation
      // Cancel any pending animations first
      cancelAllPendingAnimations();
      const currentToken = ++switchToken;
      
      // First, ensure it's visible but still translated down
      containerElement.style.display = 'block';
      containerElement.style.transform = 'translateY(100%)';
      // Force a reflow to ensure the browser applies the initial transform
      containerElement.offsetHeight;
      // Then animate it up in the next frame
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => {
          // Guard: only apply if this is still the current switch
          if (currentToken === switchToken && containerElement && isEnabled) {
            containerElement.style.transform = 'translateY(0)';
          }
        });
        pendingRAF.push(raf2);
      });
      pendingRAF.push(raf1);
    } else {
      // Hide with slide-down animation
      cancelAllPendingAnimations();
      const currentToken = ++switchToken;
      
      containerElement.style.transform = 'translateY(100%)';
      // Hide after transition completes
      const timeoutId = setTimeout(() => {
        if (currentToken === switchToken && !isEnabled && containerElement) {
          containerElement.style.display = 'none';
        }
      }, 300); // Match transition duration (300ms)
      pendingTimeouts.push(timeoutId);
    }
  }
  
  console.log(`[CameraView] ${isEnabled ? 'Enabled' : 'Disabled'}`);
  return isEnabled;
}


/**
 * Check if camera view is currently enabled
 * @returns {boolean}
 */
export function isCameraViewEnabled() {
  return isEnabled;
}

// ============================================================================
// UPDATE (RENDER LOOP)
// ============================================================================

/**
 * Update the camera view preview
 * Call this in the animation loop ONLY when the camera is enabled
 * 
 * HOW THE PREVIEW CAMERA SYNCS WITH PLAYER CAMERA:
 * 1. We copy the main camera's world position directly
 * 2. We copy the main camera's quaternion (rotation) directly
 * 3. This ensures the preview shows EXACTLY what the player sees
 * 4. The preview camera has the same FOV, so perspective matches
 */
export function updateCameraView() {
  // Safety check - don't render if not enabled or not initialized
  if (!isEnabled || !renderer || !scene || !mainCamera || !renderTarget) {
    return;
  }

  // Sync the preview camera with the main camera's transform
  // This makes the preview show exactly what the player sees
  previewCamera.position.copy(mainCamera.position);
  previewCamera.quaternion.copy(mainCamera.quaternion);
  
  // Update FOV in case it changed (e.g., zoom effects)
  if (previewCamera.fov !== mainCamera.fov) {
    previewCamera.fov = mainCamera.fov;
    previewCamera.updateProjectionMatrix();
  }

  // Store the current render target so we can restore it after
  const currentRenderTarget = renderer.getRenderTarget();

  // Render the scene to our off-screen render target
  // This is the core of render-to-texture: we redirect GPU output to our framebuffer
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, previewCamera);

  // Restore the original render target (null = screen)
  renderer.setRenderTarget(currentRenderTarget);

  // Read the pixels from the render target and draw to canvas
  // This transfers the GPU framebuffer data to a CPU-accessible canvas
  const pixelBuffer = new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT, pixelBuffer);

  // Create ImageData from the pixel buffer
  const imageData = previewContext.createImageData(PREVIEW_WIDTH, PREVIEW_HEIGHT);
  
  // WebGL renders with Y=0 at bottom, but canvas has Y=0 at top
  // We need to flip the image vertically
  for (let y = 0; y < PREVIEW_HEIGHT; y++) {
    for (let x = 0; x < PREVIEW_WIDTH; x++) {
      const srcIndex = (y * PREVIEW_WIDTH + x) * 4;
      const dstIndex = ((PREVIEW_HEIGHT - 1 - y) * PREVIEW_WIDTH + x) * 4;
      
      imageData.data[dstIndex] = pixelBuffer[srcIndex];         // R
      imageData.data[dstIndex + 1] = pixelBuffer[srcIndex + 1]; // G
      imageData.data[dstIndex + 2] = pixelBuffer[srcIndex + 2]; // B
      imageData.data[dstIndex + 3] = pixelBuffer[srcIndex + 3]; // A
    }
  }

  // Draw the flipped image to the canvas
  previewContext.putImageData(imageData, 0, 0);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Dispose of all resources (call on teardown if needed)
 */
export function disposeCameraView() {
  // Cancel all pending animations
  cancelAllPendingAnimations();
  
  if (renderTarget) {
    renderTarget.dispose();
    renderTarget = null;
  }

  if (containerElement && containerElement.parentNode) {
    containerElement.parentNode.removeChild(containerElement);
    containerElement = null;
  }

  previewCamera = null;
  previewCanvas = null;
  previewContext = null;
  isEnabled = false;
  switchToken = 0;
  pendingTimeouts = [];
  pendingRAF = [];

  console.log('[CameraView] Disposed');
}
