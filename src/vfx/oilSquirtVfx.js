/**
 * OIL SQUIRT VFX MODULE
 * 
 * Creates a visual oil stream effect that travels from the bottle (bottom-right HUD)
 * toward the crosshair direction when the baby oil is being squeezed.
 * 
 * Uses lightweight DOM particles for performance.
 * 
 * Exports:
 *   - initOilSquirtVfx()
 *   - triggerSquirt()
 *   - update(deltaTime)
 *   - cleanup()
 */

// ===========================================
// CONSTANTS
// ===========================================

const PARTICLE_COUNT = 12; // Number of particles per squirt
const PARTICLE_LIFETIME = 0.4; // Seconds
const PARTICLE_SPEED = 800; // Pixels per second
const PARTICLE_SIZE_MIN = 3;
const PARTICLE_SIZE_MAX = 6;
const PARTICLE_OPACITY_START = 0.9;
const PARTICLE_OPACITY_END = 0.1;

// Bottle nozzle position (bottom-right HUD area)
// These are approximate screen coordinates where the bottle nozzle would be
// Will be updated on window resize
let NOZZLE_X = window.innerWidth - 300; // Right side, offset from edge (moved left by 20)
let NOZZLE_Y = window.innerHeight - 400; // Bottom, offset from edge (moved up by 15)

// ===========================================
// STATE
// ===========================================

let container = null;
let particles = [];
let initialized = false;

// ===========================================
// PARTICLE CLASS
// ===========================================

class OilParticle {
  constructor(startX, startY, directionX, directionY) {
    this.element = document.createElement('div');
    this.lifetime = PARTICLE_LIFETIME;
    this.age = 0;
    
    // Random size
    const size = PARTICLE_SIZE_MIN + Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN);
    
    // Random velocity variation
    const speedVariation = 0.7 + Math.random() * 0.6; // 70-130% of base speed
    const angleVariation = (Math.random() - 0.5) * 0.3; // ±15 degrees variation
    
    // Calculate direction with variation
    const baseAngle = Math.atan2(directionY, directionX);
    const angle = baseAngle + angleVariation;
    this.velocityX = Math.cos(angle) * PARTICLE_SPEED * speedVariation;
    this.velocityY = Math.sin(angle) * PARTICLE_SPEED * speedVariation;
    
    // Position
    this.x = startX;
    this.y = startY;
    
    // Style the particle
    Object.assign(this.element.style, {
      position: 'fixed',
      left: `${startX}px`,
      top: `${startY}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      pointerEvents: 'none',
      zIndex: '150',
      transform: 'translate(-50%, -50%)',
      boxShadow: '0 0 4px rgba(255, 255, 255, 0.6)',
      opacity: PARTICLE_OPACITY_START,
      transition: 'none'
    });
    
    container.appendChild(this.element);
  }
  
  update(deltaTime) {
    this.age += deltaTime;
    
    if (this.age >= this.lifetime) {
      this.destroy();
      return false; // Particle is dead
    }
    
    // Update position
    this.x += this.velocityX * deltaTime;
    this.y += this.velocityY * deltaTime;
    
    // Update visual properties
    const lifeRatio = this.age / this.lifetime;
    const opacity = PARTICLE_OPACITY_START + (PARTICLE_OPACITY_END - PARTICLE_OPACITY_START) * lifeRatio;
    
    // Apply gravity effect (slight downward acceleration)
    this.velocityY += 200 * deltaTime; // Gravity in pixels/s²
    
    // Update DOM
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y}px`;
    this.element.style.opacity = opacity;
    
    return true; // Particle is alive
  }
  
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Initialize the oil squirt VFX system
 * Creates the container element for particles
 */
export function initOilSquirtVfx() {
  if (initialized) {
    console.warn('OilSquirtVfx already initialized');
    return;
  }
  
  // Create container for particles
  container = document.createElement('div');
  container.id = 'oil-squirt-vfx-container';
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '150'
  });
  
  document.body.appendChild(container);
  
  initialized = true;
  console.log('Oil Squirt VFX initialized');
}

/**
 * Trigger a squirt effect
 * Creates particles that travel from the bottle nozzle toward the crosshair
 * 
 * @param {number} crosshairX - Screen X coordinate of crosshair (center of screen)
 * @param {number} crosshairY - Screen Y coordinate of crosshair (center of screen)
 */
export function triggerSquirt(crosshairX, crosshairY) {
  if (!initialized || !container) return;
  
  // Calculate direction from nozzle to crosshair
  const dx = crosshairX - NOZZLE_X;
  const dy = crosshairY - NOZZLE_Y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance < 10) return; // Too close, skip
  
  // Normalize direction
  const dirX = dx / distance;
  const dirY = dy / distance;
  
  // Create particles
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Add small random offset to nozzle position for spread
    const offsetX = (Math.random() - 0.5) * 20;
    const offsetY = (Math.random() - 0.5) * 20;
    
    const particle = new OilParticle(
      NOZZLE_X + offsetX,
      NOZZLE_Y + offsetY,
      dirX,
      dirY
    );
    
    particles.push(particle);
  }
}

/**
 * Update all active particles
 * Should be called every frame
 * 
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function update(deltaTime) {
  if (!initialized) return;
  
  // Update all particles and remove dead ones
  particles = particles.filter(particle => {
    return particle.update(deltaTime);
  });
}

/**
 * Clean up all particles and remove the container
 */
export function cleanup() {
  // Destroy all particles
  particles.forEach(particle => particle.destroy());
  particles = [];
  
  // Remove container
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
    container = null;
  }
  
  initialized = false;
}

/**
 * Update nozzle position (called when window resizes)
 * @param {number} x - Screen X coordinate
 * @param {number} y - Screen Y coordinate
 */
export function setNozzlePosition(x, y) {
  NOZZLE_X = x;
  NOZZLE_Y = y;
}

/**
 * Update nozzle position based on window size
 * Should be called on window resize
 */
export function updateNozzlePosition() {
  NOZZLE_X = window.innerWidth - 220; // Moved left by 20
  NOZZLE_Y = window.innerHeight - 165; // Moved up by 15
}
