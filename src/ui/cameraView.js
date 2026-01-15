import * as THREE from 'three';

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
// TOGGLE
// ============================================================================

/**
 * Toggle the camera view ON or OFF
 * @returns {boolean} The new enabled state
 */
export function toggleCameraView() {
  isEnabled = !isEnabled;

  if (isEnabled) {
    // Show the camera UI
    // First, ensure it's visible but still translated down
    containerElement.style.display = 'block';
    containerElement.style.transform = 'translateY(100%)';
    // Force a reflow to ensure the browser applies the initial transform
    containerElement.offsetHeight;
    // Then animate it up in the next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        containerElement.style.transform = 'translateY(0)';
      });
    });
    console.log('[CameraView] Enabled');
  } else {
    // Hide the camera UI with slide-down animation
    containerElement.style.transform = 'translateY(100%)';
    // Hide after transition completes
    setTimeout(() => {
      if (!isEnabled) {
        containerElement.style.display = 'none';
      }
    }, 300); // Match transition duration (300ms)
    console.log('[CameraView] Disabled');
  }

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

  console.log('[CameraView] Disposed');
}
