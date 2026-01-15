/**
 * Dialogue Bubble System
 * 
 * Creates 3D dialogue bubbles that appear above NPCs when they speak.
 * Uses canvas-based textures for dynamic text rendering and billboarded sprites
 * that always face the camera.
 */

import * as THREE from 'three';

// Bubble configuration
const BUBBLE_CONFIG = {
  padding: 16,
  maxWidth: 300,
  fontSize: 18,
  fontFamily: 'Arial, sans-serif',
  backgroundColor: 'rgba(0, 0, 0, 0.85)',
  textColor: '#ffffff',
  borderRadius: 12,
  lineHeight: 1.4,
  bubbleHeight: 1.8, // Y offset above NPC head
  lifetime: 3.0, // seconds
  scale: 0.008 // Base scale for the sprite (adjusted for reasonable size)
};

/**
 * Creates a canvas texture with wrapped text for the dialogue bubble
 * @param {string} text - The dialogue text to display
 * @returns {THREE.CanvasTexture}
 */
function createBubbleTexture(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Set font
  ctx.font = `${BUBBLE_CONFIG.fontSize}px ${BUBBLE_CONFIG.fontFamily}`;
  
  // Calculate text width and wrap text
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > BUBBLE_CONFIG.maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  
  // Calculate canvas dimensions
  const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
  const textHeight = lines.length * BUBBLE_CONFIG.fontSize * BUBBLE_CONFIG.lineHeight;
  
  canvas.width = Math.ceil(textWidth + BUBBLE_CONFIG.padding * 2);
  canvas.height = Math.ceil(textHeight + BUBBLE_CONFIG.padding * 2);
  
  // Redraw with proper dimensions
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw rounded rectangle background
  ctx.fillStyle = BUBBLE_CONFIG.backgroundColor;
  const x = BUBBLE_CONFIG.padding / 2;
  const y = BUBBLE_CONFIG.padding / 2;
  const w = canvas.width - BUBBLE_CONFIG.padding;
  const h = canvas.height - BUBBLE_CONFIG.padding;
  const r = BUBBLE_CONFIG.borderRadius;
  
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  
  // Draw text
  ctx.fillStyle = BUBBLE_CONFIG.textColor;
  ctx.font = `${BUBBLE_CONFIG.fontSize}px ${BUBBLE_CONFIG.fontFamily}`;
  ctx.textBaseline = 'top';
  
  lines.forEach((line, index) => {
    const y = BUBBLE_CONFIG.padding + (index * BUBBLE_CONFIG.fontSize * BUBBLE_CONFIG.lineHeight);
    ctx.fillText(line, BUBBLE_CONFIG.padding, y);
  });
  
  // Create texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  
  return texture;
}

/**
 * Creates a billboarded sprite for the dialogue bubble
 * @param {string} text - The dialogue text
 * @returns {THREE.Sprite}
 */
export function createDialogueBubble(text) {
  const texture = createBubbleTexture(text);
  
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.1,
    depthTest: true,
    depthWrite: false
  });
  
  const sprite = new THREE.Sprite(material);
  
  // Scale based on texture dimensions
  const aspect = texture.image.width / texture.image.height;
  sprite.scale.set(
    BUBBLE_CONFIG.scale * texture.image.width,
    BUBBLE_CONFIG.scale * texture.image.height,
    1
  );
  
  return {
    sprite: sprite,
    texture: texture,
    material: material,
    lifetime: BUBBLE_CONFIG.lifetime,
    timeRemaining: BUBBLE_CONFIG.lifetime
  };
}

/**
 * Updates the bubble's billboard rotation to face the camera
 * @param {THREE.Sprite} sprite - The bubble sprite
 * @param {THREE.Vector3} npcPosition - NPC's world position
 * @param {THREE.Camera} camera - The camera to face
 */
export function updateBubbleBillboard(sprite, npcPosition, camera) {
  // Calculate direction from NPC to camera
  const dx = camera.position.x - npcPosition.x;
  const dz = camera.position.z - npcPosition.z;
  
  // Calculate yaw angle (rotation around Y axis)
  // Add π/2 because sprites in Three.js face -Z by default
  const yaw = Math.atan2(dx, dz) + Math.PI / 2;
  sprite.rotation.y = yaw;
}

/**
 * Updates bubble lifetime and returns true if it should be removed
 * @param {Object} bubble - The bubble object
 * @param {number} deltaTime - Time since last frame in seconds
 * @returns {boolean} True if bubble should be removed
 */
export function updateBubbleLifetime(bubble, deltaTime) {
  bubble.timeRemaining -= deltaTime;
  
  // Fade out in the last 0.5 seconds
  if (bubble.timeRemaining < 0.5) {
    const fadeAlpha = bubble.timeRemaining / 0.5;
    bubble.material.opacity = fadeAlpha;
  }
  
  return bubble.timeRemaining <= 0;
}

/**
 * Disposes of bubble resources to prevent memory leaks
 * @param {Object} bubble - The bubble object to dispose
 */
export function disposeBubble(bubble) {
  if (bubble.texture) {
    bubble.texture.dispose();
  }
  if (bubble.material) {
    bubble.material.dispose();
  }
  if (bubble.sprite && bubble.sprite.parent) {
    bubble.sprite.parent.remove(bubble.sprite);
  }
}
