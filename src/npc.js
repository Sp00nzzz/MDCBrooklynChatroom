import * as THREE from 'three';

// Texture loader for image-based NPCs
const textureLoader = new THREE.TextureLoader();

/**
 * Creates a procedurally generated sprite texture for NPCs
 * @returns {THREE.Texture}
 */
function createNPCTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // Transparent background
  ctx.clearRect(0, 0, 256, 256);
  
  // Draw a simple guard silhouette
  ctx.fillStyle = '#2c3e50';
  
  // Body (rectangle)
  ctx.fillRect(100, 80, 56, 100);
  
  // Head (circle)
  ctx.beginPath();
  ctx.arc(128, 60, 20, 0, Math.PI * 2);
  ctx.fill();
  
  // Arms
  ctx.fillRect(80, 90, 20, 60);
  ctx.fillRect(156, 90, 20, 60);
  
  // Legs
  ctx.fillRect(110, 180, 18, 50);
  ctx.fillRect(128, 180, 18, 50);
  
  // Hat/helmet
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(108, 40, 40, 25);
  
  // Convert canvas to texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.needsUpdate = true;
  
  return texture;
}

/**
 * Loads an image texture for NPCs
 * @param {string} imagePath - Path to the image file
 * @returns {THREE.Texture}
 */
function loadNPCTexture(imagePath) {
  const texture = textureLoader.load(imagePath);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * NPC Sprite class - Doom-style 2D sprite that billboards to face camera
 * and performs simple randomized wandering with collision against static walls.
 */
export class NPCSprite {
  /**
   * @param {THREE.Vector3} position - Initial world position
   * @param {THREE.Texture|string|null} textureOrPath - Optional texture or image path
   * @param {THREE.Box3[]} colliders - Static world colliders for NPC movement
   * @param {string} characterName - Character name for dialogue linking (optional)
   */
  constructor(position, textureOrPath = null, colliders = [], characterName = null) {
    this.position = position.clone();
    this.colliders = colliders;
    this.characterName = characterName; // Link to chat character name
    this.speechBubble = null; // Active dialogue bubble (null if none)
    
    // Identify Diddy NPC by texture path or character name
    const texturePathStr = typeof textureOrPath === 'string' ? textureOrPath.toLowerCase() : '';
    const charNameStr = characterName ? characterName.toLowerCase() : '';
    this.isDiddy = texturePathStr.includes('diddy') || charNameStr.includes('sean comb');
    
    // Identify Kool-Aid Man NPC by texture path or character name
    this.isKoolAidMan = texturePathStr.includes('koolaid') || charNameStr.includes('kool-aid man');
    
    // Identify 6ix9ine NPC by texture path or character name
    this.is6ix9ine = texturePathStr.includes('6ix9ine') || charNameStr.includes('6ix9ine');
    
    // Identify Maduro NPC by texture path or character name
    this.isMaduro = texturePathStr.includes('maduro') || charNameStr.includes('nicolas maduro');
    
    // Identify Cohen NPC by texture path or character name (matches Andy Cohen or Michael Cohen)
    this.isCohen = texturePathStr.includes('cohen') || charNameStr.includes('cohen');

    // Movement/wander parameters
    this.baseY = this.position.y;           // Keep NPCs grounded at this Y
    this.radius = 0.4;                      // Collision radius on XZ plane
    this.baseSpeed = 1.6;
    // Slight per-NPC speed variance so they don't look identical
    this.moveSpeed = this.baseSpeed * THREE.MathUtils.randFloat(0.8, 1.2);

    this.wanderYaw = Math.random() * Math.PI * 2; // Current movement direction (yaw, radians)
    this.wanderTimeRemaining = 0;                 // Time until we pick a new direction
    this.minWanderTime = 0.8;
    this.maxWanderTime = 2.5;

    // Reusable sphere for cheap sphere-vs-AABB checks
    this.collisionSphere = new THREE.Sphere(this.position.clone(), this.radius);

    // Push/velocity system for physical interactions
    this.velocity = new THREE.Vector3(0, 0, 0); // Current velocity
    this.pushCooldown = 0; // Time remaining until this NPC can be pushed again
    this.maxSpeed = 14.0; // Maximum velocity magnitude (increased for stronger pushes)
    this.damping = 0.80; // Velocity damping per second (reduced for longer travel distance, applied as 0.80^(dt*60))

    // Create sprite - use provided texture, image path, or procedural texture
    let texture = null;
    if (textureOrPath instanceof THREE.Texture) {
      texture = textureOrPath;
    } else if (typeof textureOrPath === 'string') {
      texture = loadNPCTexture(textureOrPath);
    } else {
      texture = createNPCTexture();
    }

    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1
    });

    this.sprite = new THREE.Sprite(spriteMaterial);
    // Scale taller for image-based sprites (person proportions)
    const isCustomImage = typeof textureOrPath === 'string' || textureOrPath instanceof THREE.Texture;
    this.sprite.scale.set(isCustomImage ? 1.5 : 2, isCustomImage ? 3 : 2, 1);
    this.sprite.position.copy(this.position);
  }

  /**
   * Randomly choose a new wander direction and travel time.
   * Direction: uniform random yaw in [0, 2π)
   * Time: random in [minWanderTime, maxWanderTime]
   */
  pickNewWander() {
    this.wanderYaw = Math.random() * Math.PI * 2;
    this.wanderTimeRemaining = THREE.MathUtils.randFloat(
      this.minWanderTime,
      this.maxWanderTime
    );
  }

  /**
   * Advance wander timer and pick a new direction when it expires.
   * @param {number} deltaTime
   */
  updateWander(deltaTime) {
    this.wanderTimeRemaining -= deltaTime;
    if (this.wanderTimeRemaining <= 0) {
      this.pickNewWander();
    }
  }

  /**
   * Test if the NPC sphere at (x,z) intersects any collider Box3.
   * Uses a sphere on XZ with fixed Y so NPC stays grounded.
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  hasCollisionAt(x, z) {
    this.collisionSphere.center.set(x, this.baseY, z);
    this.collisionSphere.radius = this.radius;

    for (const box of this.colliders) {
      if (box.intersectsSphere(this.collisionSphere)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Move along the current wander direction with per-axis collision resolution.
   * We attempt X, resolve/cancel, then attempt Z, resolve/cancel.
   * This axis separation prevents jittery corrections when sliding along walls.
   * @param {number} deltaTime
   */
  moveWithCollision(deltaTime) {
    // Apply velocity from push interactions first
    if (this.velocity.lengthSq() > 0.001) {
      // Apply velocity movement
      const velocityStep = this.velocity.clone().multiplyScalar(deltaTime);
      
      // Try to move with velocity, checking collisions
      const targetX = this.position.x + velocityStep.x;
      const targetZ = this.position.z + velocityStep.z;
      
      // Check collisions for velocity movement
      if (!this.hasCollisionAt(targetX, this.position.z)) {
        this.position.x = targetX;
      } else {
        // Bounce off wall: reverse X velocity
        this.velocity.x *= -0.5;
      }
      
      if (!this.hasCollisionAt(this.position.x, targetZ)) {
        this.position.z = targetZ;
      } else {
        // Bounce off wall: reverse Z velocity
        this.velocity.z *= -0.5;
      }
      
      // Apply damping to velocity
      const dampingFactor = Math.pow(this.damping, deltaTime * 60);
      this.velocity.multiplyScalar(dampingFactor);
      
      // Clamp max speed
      if (this.velocity.length() > this.maxSpeed) {
        this.velocity.normalize().multiplyScalar(this.maxSpeed);
      }
      
      // If velocity is very small, zero it out
      if (this.velocity.lengthSq() < 0.001) {
        this.velocity.set(0, 0, 0);
      }
    }

    // Only apply wander movement if velocity is low (NPCs can't wander while being pushed)
    if (this.velocity.lengthSq() < 0.5) {
      // Direction vector in XZ from current yaw
      const dirX = Math.sin(this.wanderYaw);
      const dirZ = Math.cos(this.wanderYaw);

      const step = this.moveSpeed * deltaTime;
      let dx = dirX * step;
      let dz = dirZ * step;

      const originalYaw = this.wanderYaw;
      let collidedX = false;
      let collidedZ = false;

      // Keep NPC locked to floor height
      this.position.y = this.baseY;

      // --- X axis movement ---
      if (dx !== 0) {
        const targetX = this.position.x + dx;
        if (!this.hasCollisionAt(targetX, this.position.z)) {
          this.position.x = targetX;
        } else {
          // Cancel X movement when moving into collision
          dx = 0;
          collidedX = true;
        }
      }

      // --- Z axis movement ---
      if (dz !== 0) {
        const targetZ = this.position.z + dz;
        if (!this.hasCollisionAt(this.position.x, targetZ)) {
          this.position.z = targetZ;
        } else {
          // Cancel Z movement when moving into collision
          dz = 0;
          collidedZ = true;
        }
      }

      // If we hit something, immediately "bounce/turn" away
      if (collidedX || collidedZ) {
        this.handleBounce(originalYaw, collidedX, collidedZ);
      }
    } else {
      // Keep NPC locked to floor height during push
      this.position.y = this.baseY;
    }

    // Update sprite world position after movement
    this.sprite.position.copy(this.position);
  }

  /**
   * When we collide, choose a new direction biased away from the wall.
   * We reflect the yaw across the axis that collided and add some random
   * 90–180 degree turn so NPCs don't get stuck pushing into walls.
   * @param {number} previousYaw
   * @param {boolean} collidedX
   * @param {boolean} collidedZ
   */
  handleBounce(previousYaw, collidedX, collidedZ) {
    let newYaw = previousYaw;

    const dirX = Math.sin(previousYaw);
    const dirZ = Math.cos(previousYaw);

    if (collidedX && !collidedZ) {
      // Reflection across Z axis: invert X component
      newYaw = Math.atan2(-dirX, dirZ);
    } else if (!collidedX && collidedZ) {
      // Reflection across X axis: invert Z component
      newYaw = Math.atan2(dirX, -dirZ);
    } else {
      // Corner hit: turn around
      newYaw = previousYaw + Math.PI;
    }

    // Add a bit of random turn (±45°) so behavior looks less mechanical
    const randomTurn = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-45, 45));
    this.wanderYaw = newYaw + randomTurn;

    // Reset wander timer so we don't keep pushing into the wall
    this.wanderTimeRemaining = THREE.MathUtils.randFloat(
      this.minWanderTime,
      this.maxWanderTime
    );
  }

  /**
   * BILLBOARD ROTATION - Face camera, rotate ONLY on Y axis (yaw).
   * Movement direction is independent; billboard always faces the camera.
   * @param {THREE.Camera} camera
   */
  updateBillboard(camera) {
    const dx = camera.position.x - this.position.x;
    const dz = camera.position.z - this.position.z;

    // atan2(dx, dz) gives angle from positive Z toward positive X.
    // Add π/2 because sprites in Three.js face -Z by default.
    const yaw = Math.atan2(dx, dz) + Math.PI / 2;
    this.sprite.rotation.y = yaw;
  }

  /**
   * Show a dialogue bubble above this NPC
   * @param {string} text - The dialogue text to display
   * @param {Function} createBubbleFn - Function to create a bubble (from dialogueBubble.js)
   * @param {THREE.Scene} scene - Scene to add bubble to
   * @param {Function} disposeBubbleFn - Function to dispose bubble (optional, for cleanup)
   */
  showDialogue(text, createBubbleFn, scene, disposeBubbleFn = null) {
    // Remove existing bubble if present (dispose old one)
    if (this.speechBubble) {
      if (disposeBubbleFn) {
        disposeBubbleFn(this.speechBubble);
      } else if (this.speechBubble.sprite && this.speechBubble.sprite.parent) {
        // Fallback: just remove from scene if no dispose function
        this.speechBubble.sprite.parent.remove(this.speechBubble.sprite);
      }
    }
    
    // Create new bubble
    this.speechBubble = createBubbleFn(text);
    
    // Position bubble above NPC head
    const bubbleY = this.position.y + 1.8; // Offset above head
    this.speechBubble.sprite.position.set(
      this.position.x,
      bubbleY,
      this.position.z
    );
    
    // Add to scene
    scene.add(this.speechBubble.sprite);
  }

  /**
   * Hide and remove the dialogue bubble
   * @param {Function} disposeBubbleFn - Function to dispose bubble (from dialogueBubble.js)
   */
  hideDialogue(disposeBubbleFn = null) {
    if (this.speechBubble) {
      if (disposeBubbleFn) {
        disposeBubbleFn(this.speechBubble);
      } else if (this.speechBubble.sprite && this.speechBubble.sprite.parent) {
        // Fallback: just remove from scene if no dispose function
        this.speechBubble.sprite.parent.remove(this.speechBubble.sprite);
      }
      this.speechBubble = null;
    }
  }

  /**
   * Apply a push impulse to this NPC
   * @param {THREE.Vector3} direction - Normalized direction vector (from player to NPC)
   * @param {number} strength - Impulse strength (default: 4.0)
   */
  applyPush(direction, strength = 4.0) {
    // Add upward bias (optional, makes push feel more dynamic)
    const upwardBias = 0.2; // Slightly increased for more dramatic launch
    const pushDirection = direction.clone();
    pushDirection.y = upwardBias;
    pushDirection.normalize();
    
    // Apply impulse to velocity (stronger impact)
    this.velocity.add(pushDirection.multiplyScalar(strength));
    
    // Clamp to max speed immediately
    if (this.velocity.length() > this.maxSpeed) {
      this.velocity.normalize().multiplyScalar(this.maxSpeed);
    }
  }

  /**
   * Update NPC position and billboard rotation.
   * @param {number} deltaTime - Time since last frame in seconds
   * @param {THREE.Camera} camera - Camera to face
   * @param {Function} updateBubbleBillboardFn - Function to update bubble billboard
   * @param {Function} updateBubbleLifetimeFn - Function to update bubble lifetime
   * @param {Function} disposeBubbleFn - Function to dispose bubble
   * @param {THREE.Scene} scene - Scene (for bubble removal)
   */
  update(deltaTime, camera, updateBubbleBillboardFn = null, updateBubbleLifetimeFn = null, disposeBubbleFn = null, scene = null) {
    // Update push cooldown
    if (this.pushCooldown > 0) {
      this.pushCooldown -= deltaTime;
      if (this.pushCooldown < 0) {
        this.pushCooldown = 0;
      }
    }
    
    this.updateWander(deltaTime);
    this.moveWithCollision(deltaTime);
    this.updateBillboard(camera);
    
    // Update dialogue bubble if present
    if (this.speechBubble) {
      // Update bubble position to follow NPC
      const bubbleY = this.position.y + 1.8;
      this.speechBubble.sprite.position.set(
        this.position.x,
        bubbleY,
        this.position.z
      );
      
      // Update billboard rotation to face camera
      if (updateBubbleBillboardFn) {
        updateBubbleBillboardFn(this.speechBubble.sprite, this.position, camera);
      }
      
      // Update lifetime and remove if expired
      if (updateBubbleLifetimeFn) {
        const shouldRemove = updateBubbleLifetimeFn(this.speechBubble, deltaTime);
        if (shouldRemove) {
          this.hideDialogue(disposeBubbleFn);
        }
      }
    }
  }

  /**
   * Get the Three.js sprite object to add to scene
   * @returns {THREE.Sprite}
   */
  getSprite() {
    return this.sprite;
  }
}
