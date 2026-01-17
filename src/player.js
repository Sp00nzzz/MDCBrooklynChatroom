import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

/**
 * Creates a first-person player with movement, gravity, and collision
 * @param {THREE.PerspectiveCamera} camera - The camera to control
 * @param {HTMLElement} domElement - DOM element for pointer lock
 * @param {Array} colliders - Array of bounding box colliders {min, max}
 * @returns {Object} { controls, velocity, update }
 */
export function createPlayer(camera, domElement, colliders) {
  const controls = new PointerLockControls(camera, domElement);
  
  // Player physics
  const velocity = new THREE.Vector3();
  const moveSpeed = 5.0;
  const gravity = -20.0;
  const playerHeight = 1.6;
  const playerRadius = 0.3;
  
  // Player position (start in the middle of corridor)
  camera.position.set(0, playerHeight, 0);
  
  // Pointer lock event listeners
  const instructions = document.getElementById('instructions');
  
  domElement.addEventListener('click', () => {
    controls.lock();
  });
  
  controls.addEventListener('lock', () => {
    if (instructions) instructions.classList.add('hidden');
  });
  
  controls.addEventListener('unlock', () => {
    if (instructions) instructions.classList.remove('hidden');
  });
  
  // Keyboard state
  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false
  };

  let movementLocked = false;
  let cameraLocked = false;
  let lockedCameraPosition = null;
  let lockedCameraQuaternion = null;
  let originalConnect = null;
  let restoreFrames = 0; // Frames to continue restoring after unlock
  
  // No-collision mode toggle
  let noCollision = false;
  
  const onKeyDown = (event) => {
    // Don't process movement keys if movement is locked (e.g., during DDR fight)
    if (movementLocked) {
      // Only allow non-movement keys (like KeyV for no-collision toggle)
      if (event.code === 'KeyV') {
        noCollision = !noCollision;
      }
      return;
    }
    
    switch (event.code) {
      case 'KeyW': keys.forward = true; break;
      case 'KeyS': keys.backward = true; break;
      case 'KeyA': keys.left = true; break;
      case 'KeyD': keys.right = true; break;
      case 'KeyV': noCollision = !noCollision; break;
    }
  };
  
  const onKeyUp = (event) => {
    // Don't process movement keys if movement is locked (e.g., during DDR fight)
    if (movementLocked) return;
    
    switch (event.code) {
      case 'KeyW': keys.forward = false; break;
      case 'KeyS': keys.backward = false; break;
      case 'KeyA': keys.left = false; break;
      case 'KeyD': keys.right = false; break;
    }
  };
  
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  
  // Collision detection using sphere approximation
  function checkCollision(newPosition) {
    const sphereCenter = new THREE.Vector3(
      newPosition.x,
      newPosition.y + playerRadius,
      newPosition.z
    );
    
    for (const collider of colliders) {
      // Expand collider by player radius
      const expandedMin = collider.min.clone().subScalar(playerRadius);
      const expandedMax = collider.max.clone().addScalar(playerRadius);
      
      // Clamp sphere center to expanded AABB
      const clamped = sphereCenter.clone();
      clamped.clamp(expandedMin, expandedMax);
      
      // Check if clamped point is inside sphere
      const distance = sphereCenter.distanceTo(clamped);
      if (distance < playerRadius) {
        // Collision detected - slide along wall
        const normal = sphereCenter.clone().sub(clamped).normalize();
        if (normal.length() > 0) {
          const slide = normal.multiplyScalar(playerRadius - distance);
          newPosition.add(slide);
        }
      }
    }
    
    // Keep player on floor
    if (newPosition.y < playerHeight) {
      newPosition.y = playerHeight;
      velocity.y = 0;
    }
    
    return newPosition;
  }
  
  // Reusable vectors to avoid per-frame allocations
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const movement = new THREE.Vector3();

  /**
   * Update player position and physics
   * @param {number} deltaTime - Time since last frame in seconds
   */
  function update(deltaTime) {
    if (!controls.isLocked) return;
    
    // Lock camera position and rotation during fight
    if (cameraLocked && lockedCameraPosition && lockedCameraQuaternion) {
      // Restore exact position and rotation every frame
      // This must happen AFTER PointerLockControls updates, so we do it here
      camera.position.copy(lockedCameraPosition);
      camera.quaternion.copy(lockedCameraQuaternion);
      return; // Don't process movement
    }
    
    // Continue restoring camera for a few frames after unlock to ensure it sticks
    if (restoreFrames > 0 && lockedCameraPosition && lockedCameraQuaternion) {
      camera.position.copy(lockedCameraPosition);
      camera.quaternion.copy(lockedCameraQuaternion);
      restoreFrames--;
      if (restoreFrames === 0) {
        // Clear after final restore
        lockedCameraPosition = null;
        lockedCameraQuaternion = null;
      }
    }
    
    if (movementLocked) return;
    
    // Get camera forward direction projected onto XZ plane (yaw only, ignore pitch)
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    
    // Get right vector from forward × up
    right.crossVectors(forward, camera.up).normalize();
    
    // Build movement vector from key states
    movement.set(0, 0, 0);
    
    if (keys.forward) movement.add(forward);
    if (keys.backward) movement.sub(forward);
    if (keys.right) movement.add(right);
    if (keys.left) movement.sub(right);
    
    // Normalize so diagonal movement isn't faster, then apply speed
    if (movement.lengthSq() > 0) {
      movement.normalize();
      movement.multiplyScalar(moveSpeed * deltaTime);
    }
    
    // Apply gravity
    velocity.y += gravity * deltaTime;
    
    // Compute new position
    const newPosition = camera.position.clone();
    newPosition.x += movement.x;
    newPosition.z += movement.z;
    newPosition.y += velocity.y * deltaTime;
    
    // Check collisions and adjust position (skip wall collisions if noCollision is enabled)
    let finalPosition;
    if (noCollision) {
      // Skip wall collisions but still keep player on floor
      finalPosition = newPosition;
      if (finalPosition.y < playerHeight) {
        finalPosition.y = playerHeight;
        velocity.y = 0;
      }
    } else {
      finalPosition = checkCollision(newPosition);
    }
    camera.position.copy(finalPosition);
  }
  
  return {
    controls,
    velocity,
    update,
    setMovementLocked(locked) {
      movementLocked = locked;
      // Clear all movement keys and velocity when locking to prevent movement
      if (locked) {
        keys.forward = false;
        keys.backward = false;
        keys.left = false;
        keys.right = false;
        velocity.set(0, 0, 0);
      }
    },
    setCameraLocked(locked) {
      cameraLocked = locked;
      if (locked) {
        // Store current camera position and full quaternion rotation
        lockedCameraPosition = camera.position.clone();
        lockedCameraQuaternion = camera.quaternion.clone();
        restoreFrames = 0; // Reset restore frames
        
        // Disable PointerLockControls rotation updates by overriding connect
        if (!originalConnect) {
          originalConnect = controls.connect.bind(controls);
        }
        // Override connect to prevent rotation updates
        controls.connect = function() {
          // Do nothing - prevents mouse movement from rotating camera
        };
      } else {
        // Restore PointerLockControls connect method FIRST
        if (originalConnect) {
          controls.connect = originalConnect;
          originalConnect = null;
        }
        
        // Restore exact camera position and rotation
        if (lockedCameraPosition && lockedCameraQuaternion) {
          camera.position.copy(lockedCameraPosition);
          camera.quaternion.copy(lockedCameraQuaternion);
          
          // Continue restoring for 2 more frames to ensure it sticks
          // (in case controls update it after we restore)
          restoreFrames = 2;
        } else {
          // No stored state, clear immediately
          lockedCameraPosition = null;
          lockedCameraQuaternion = null;
          restoreFrames = 0;
        }
      }
    }
  };
}
