import * as THREE from 'three';

// Module-level references for tables and their pickup items
const tables = []; // Array of { sprite, position, itemType, pickedUp }
let animationTime = 0;

// Debug flag for table collision (set to true to log collision events)
const DEBUG_TABLE_COLLISION = false;

/**
 * Creates a low-poly wooden table with pickup item images on top
 * 
 * TABLE DIMENSIONS:
 * - Tabletop: 2.5 (width) x 0.1 (height) x 1.5 (depth)
 * - Legs: 0.15 x 0.15 (thickness), 0.75 (height)
 * - Total table height: ~0.85 units
 * 
 * @param {THREE.Vector3} position - Position to place the table (Y = floor level)
 * @param {string} itemTexturePath - Optional path to the item texture (default: '/babyoil.png')
 * @param {string} itemType - Optional item type identifier (default: 'babyoil')
 * @returns {THREE.Group} The table group containing tabletop, legs, and pickup item images
 */
export function createTable(position = new THREE.Vector3(0, 0, 0), itemTexturePath = '/babyoil.png', itemType = 'babyoil') {
  const tableGroup = new THREE.Group();
  
  // ===== TABLE DIMENSIONS =====
  const tabletopWidth = 2.5;   // X dimension (wider)
  const tabletopDepth = 1.5;   // Z dimension
  const tabletopHeight = 0.1;  // Y dimension (thickness)
  
  const legWidth = 0.15;
  const legDepth = 0.15;
  const legHeight = 0.75;
  
  // Legs are slightly inset from corners
  const legInset = 0.2;
  
  // Total table surface height
  const tableTopY = legHeight + tabletopHeight / 2;
  
  // ===== WOOD MATERIAL =====
  // Dark brown wood tone with low metalness and medium roughness
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c3d2e,  // Dark wood brown
    roughness: 0.7,
    metalness: 0.1
  });
  
  // ===== TABLETOP =====
  const tabletopGeometry = new THREE.BoxGeometry(tabletopWidth, tabletopHeight, tabletopDepth);
  const tabletop = new THREE.Mesh(tabletopGeometry, woodMaterial);
  tabletop.position.set(0, tableTopY, 0);
  tableGroup.add(tabletop);
  
  // ===== LEGS =====
  // Four straight legs at corners, slightly inset
  const legGeometry = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
  
  // Leg positions (inset from corners)
  const legPositions = [
    // Front-left leg
    { x: -tabletopWidth / 2 + legInset + legWidth / 2, z: -tabletopDepth / 2 + legInset + legDepth / 2 },
    // Front-right leg
    { x: tabletopWidth / 2 - legInset - legWidth / 2, z: -tabletopDepth / 2 + legInset + legDepth / 2 },
    // Back-left leg
    { x: -tabletopWidth / 2 + legInset + legWidth / 2, z: tabletopDepth / 2 - legInset - legDepth / 2 },
    // Back-right leg
    { x: tabletopWidth / 2 - legInset - legWidth / 2, z: tabletopDepth / 2 - legInset - legDepth / 2 }
  ];
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, woodMaterial);
    leg.position.set(pos.x, legHeight / 2, pos.z);
    tableGroup.add(leg);
  });
  
  // ===== FLOATING PICKUP ITEM =====
  // Load the item texture
  const textureLoader = new THREE.TextureLoader();
  const itemTexture = textureLoader.load(itemTexturePath);
  
  // Use Sprite for billboard effect (always faces camera like a pickup item)
  const itemMaterial = new THREE.SpriteMaterial({
    map: itemTexture,
    transparent: true
  });
  
  const itemSprite = new THREE.Sprite(itemMaterial);
  
  // Scale the sprite (width, height)
  itemSprite.scale.set(0.6, 0.75, 1);
  
  // Float above the table surface (pickable item style)
  const floatHeight = tableTopY + tabletopHeight / 2 + 0.5;
  itemSprite.position.set(0, floatHeight, 0);
  
  // Store reference for animation updates
  itemSprite.userData.isPickupItem = true;
  itemSprite.userData.baseY = floatHeight;
  
  tableGroup.add(itemSprite);
  
  // ===== POSITION THE TABLE =====
  tableGroup.position.copy(position);
  
  // Store table data for pickup detection
  tables.push({
    sprite: itemSprite,
    position: position.clone(),
    itemType: itemType,
    pickedUp: false
  });
  
  return tableGroup;
}

/**
 * Updates all table pickup item animations (bobbing + rotation)
 * Call this from the main animation loop
 * 
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function updateTablePickup(deltaTime) {
  animationTime += deltaTime;
  
  // Bobbing motion: smooth sine wave up and down
  const bobAmount = 0.15; // How far it bobs up/down
  const bobSpeed = 2.0;   // How fast it bobs
  
  tables.forEach(table => {
    if (table.sprite && !table.pickedUp) {
      const baseY = table.sprite.userData.baseY;
      table.sprite.position.y = baseY + Math.sin(animationTime * bobSpeed) * bobAmount;
    }
  });
}

/**
 * Creates a collision box for the table at a given world position.
 * Uses a single bounding box covering the entire table volume for simplicity and performance.
 * 
 * IMPORTANT: If the table is rotated (e.g., 90 degrees on Y), pass isRotated90 = true
 * to swap width/depth dimensions.
 * 
 * @param {THREE.Vector3} position - World position of the table (same as passed to createTable)
 * @param {boolean} isRotated90 - Whether the table is rotated 90 degrees on Y axis
 * @returns {Object} Collider object with { min, max } THREE.Vector3 properties
 */
export function createTableCollider(position, isRotated90 = false) {
  // Table dimensions (from createTable)
  const tabletopWidth = 2.5;   // X dimension (before rotation)
  const tabletopDepth = 1.5;   // Z dimension (before rotation)
  
  // Player collision uses a sphere at Y = playerHeight (1.6) + playerRadius (0.3) = 1.9
  // The table visual is only 0.85 units tall, but we need the collision box
  // to extend up to player collision height to actually block movement.
  // This is standard practice for furniture - collision doesn't match visual exactly.
  const collisionHeight = 2.0; // Tall enough to block player sphere at Y=1.9
  
  // Swap dimensions if rotated 90 degrees
  const halfWidth = isRotated90 ? tabletopDepth / 2 : tabletopWidth / 2;
  const halfDepth = isRotated90 ? tabletopWidth / 2 : tabletopDepth / 2;
  
  const collider = {
    min: new THREE.Vector3(
      position.x - halfWidth,
      position.y,           // Floor level
      position.z - halfDepth
    ),
    max: new THREE.Vector3(
      position.x + halfWidth,
      position.y + collisionHeight,  // Extended height to block player
      position.z + halfDepth
    )
  };
  
  if (DEBUG_TABLE_COLLISION) {
    console.log('Table collider created:', {
      min: collider.min.toArray(),
      max: collider.max.toArray(),
      isRotated90
    });
  }
  
  return collider;
}

/**
 * Checks if player is close enough to pick up an item from any table.
 * Call this every frame from the main animation loop.
 * 
 * @param {THREE.Vector3} playerPosition - The player's current position (camera position)
 * @param {THREE.Scene} scene - The Three.js scene (to remove sprite when picked up)
 * @returns {string|null} Item type that was just picked up (e.g., 'babyoil', 'marlboro'), or null if nothing picked up
 */
export function checkTablePickup(playerPosition, scene) {
  const pickupRange = 2.5;
  
  for (const table of tables) {
    if (table.pickedUp || !table.sprite) continue;
    
    // Calculate horizontal distance (XZ plane) from player to table center
    const dx = playerPosition.x - table.position.x;
    const dz = playerPosition.z - table.position.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    
    if (horizontalDistance <= pickupRange) {
      // Player is touching the table - pick up the item!
      table.pickedUp = true;
      
      // Remove the sprite from scene
      if (table.sprite.parent) {
        table.sprite.parent.remove(table.sprite);
      }
      
      // Dispose of sprite resources
      if (table.sprite.material) {
        if (table.sprite.material.map) {
          table.sprite.material.map.dispose();
        }
        table.sprite.material.dispose();
      }
      
      const itemType = table.itemType;
      table.sprite = null;
      
      console.log(`${itemType} picked up!`);
      return itemType;
    }
  }
  
  return null;
}

/**
 * Checks if player is close enough to pick up the baby oil from the table.
 * @deprecated Use checkTablePickup instead
 * @param {THREE.Vector3} playerPosition - The player's current position (camera position)
 * @param {THREE.Scene} scene - The Three.js scene (to remove sprite when picked up)
 * @returns {boolean} true if baby oil was just picked up this frame, false otherwise
 */
export function checkBabyOilPickup(playerPosition, scene) {
  const itemType = checkTablePickup(playerPosition, scene);
  return itemType === 'babyoil';
}

/**
 * Check if baby oil has already been picked up
 * @deprecated Use checkTablePickup instead
 * @returns {boolean} true if already collected
 */
export function isBabyOilPickedUp() {
  const babyOilTable = tables.find(t => t.itemType === 'babyoil');
  return babyOilTable ? babyOilTable.pickedUp : false;
}
