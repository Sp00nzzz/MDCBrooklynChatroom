import * as THREE from 'three';

/**
 * Creates a procedural prison interior with corridors, cells, and colliders
 * @returns {Object} { prisonGroup, colliders }
 */
export function createPrison() {
  const prisonGroup = new THREE.Group();
  const colliders = [];
  const npcColliders = [];
  
  // Material for walls and floor - lighter gray tones
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.8,
    metalness: 0.1
  });
  
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x777777,
    roughness: 0.9,
    metalness: 0.0
  });
  
  const barMaterial = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.5,
    metalness: 0.7
  });
  
  // Constants
  const CORRIDOR_HEIGHT = 5;
  const CORRIDOR_LENGTH = 60;
  const CELL_WIDTH = 4;
  const CELL_DEPTH = 5;
  const CELL_HEIGHT = CORRIDOR_HEIGHT;
  const BAR_THICKNESS = 0.1;
  const BAR_SPACING = 0.3;
  
  // Walking path width + cell depth = total corridor width
  const WALKWAY_WIDTH = 8;
  const CORRIDOR_WIDTH = WALKWAY_WIDTH + CELL_DEPTH;
  
  // Floor - spans walkway and cell area
  const floorOffset = (CELL_DEPTH - WALKWAY_WIDTH) / 4; // Slight offset to center visually
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(CORRIDOR_LENGTH, 0.2, CORRIDOR_WIDTH),
    floorMaterial
  );
  floor.position.set(0, -0.1, floorOffset);
  prisonGroup.add(floor);
  colliders.push({
    min: new THREE.Vector3(-CORRIDOR_LENGTH/2, -0.2, -WALKWAY_WIDTH/2),
    max: new THREE.Vector3(CORRIDOR_LENGTH/2, 0, WALKWAY_WIDTH/2 + CELL_DEPTH)
  });
  npcColliders.push(
    new THREE.Box3(
      new THREE.Vector3(-CORRIDOR_LENGTH/2, -0.2, -WALKWAY_WIDTH/2),
      new THREE.Vector3(CORRIDOR_LENGTH/2, 0, WALKWAY_WIDTH/2 + CELL_DEPTH)
    )
  );
  
  // Ceiling
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(CORRIDOR_LENGTH, 0.2, CORRIDOR_WIDTH),
    wallMaterial
  );
  ceiling.position.set(0, CORRIDOR_HEIGHT + 0.1, floorOffset);
  prisonGroup.add(ceiling);
  
  // Left corridor wall (opposite the cells)
  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(CORRIDOR_LENGTH, CORRIDOR_HEIGHT, 0.5),
    wallMaterial
  );
  leftWall.position.set(0, CORRIDOR_HEIGHT/2, -WALKWAY_WIDTH/2 - 3.25);
  prisonGroup.add(leftWall);
  colliders.push({
    min: new THREE.Vector3(-CORRIDOR_LENGTH/2, 0, -WALKWAY_WIDTH/2 - 3.5),
    max: new THREE.Vector3(CORRIDOR_LENGTH/2, CORRIDOR_HEIGHT, -WALKWAY_WIDTH/2 - 3)
  });
  npcColliders.push(
    new THREE.Box3(
      new THREE.Vector3(-CORRIDOR_LENGTH/2, 0, -WALKWAY_WIDTH/2 - 3.5),
      new THREE.Vector3(CORRIDOR_LENGTH/2, CORRIDOR_HEIGHT, -WALKWAY_WIDTH/2 - 3)
    )
  );
  
  // No right wall - cells serve as the boundary on that side
  
  // End walls
  const frontWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, CORRIDOR_HEIGHT, CORRIDOR_WIDTH),
    wallMaterial
  );
  frontWall.position.set(-CORRIDOR_LENGTH/2 - 0.25, CORRIDOR_HEIGHT/2, floorOffset);
  prisonGroup.add(frontWall);
  colliders.push({
    min: new THREE.Vector3(-CORRIDOR_LENGTH/2 - 0.5, 0, -WALKWAY_WIDTH/2 - 3.5),
    max: new THREE.Vector3(-CORRIDOR_LENGTH/2, CORRIDOR_HEIGHT, WALKWAY_WIDTH/2 + CELL_DEPTH)
  });
  npcColliders.push(
    new THREE.Box3(
      new THREE.Vector3(-CORRIDOR_LENGTH/2 - 0.5, 0, -WALKWAY_WIDTH/2 - 3.5),
      new THREE.Vector3(-CORRIDOR_LENGTH/2, CORRIDOR_HEIGHT, WALKWAY_WIDTH/2 + CELL_DEPTH)
    )
  );

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, CORRIDOR_HEIGHT, CORRIDOR_WIDTH),
    wallMaterial
  );
  backWall.position.set(CORRIDOR_LENGTH/2 + 0.25, CORRIDOR_HEIGHT/2, floorOffset);
  prisonGroup.add(backWall);
  colliders.push({
    min: new THREE.Vector3(CORRIDOR_LENGTH/2, 0, -WALKWAY_WIDTH/2 - 3.5),
    max: new THREE.Vector3(CORRIDOR_LENGTH/2 + 0.5, CORRIDOR_HEIGHT, WALKWAY_WIDTH/2 + CELL_DEPTH)
  });
  npcColliders.push(
    new THREE.Box3(
      new THREE.Vector3(CORRIDOR_LENGTH/2, 0, -WALKWAY_WIDTH/2 - 3.5),
      new THREE.Vector3(CORRIDOR_LENGTH/2 + 0.5, CORRIDOR_HEIGHT, WALKWAY_WIDTH/2 + CELL_DEPTH)
    )
  );
  
  // Create cells in a horizontal row (positive Z side)
  // Cells are side-by-side along X axis, all facing the walkway (toward -Z)
  const numCells = Math.floor(CORRIDOR_LENGTH / (CELL_WIDTH + 0.5));
  const totalCellsWidth = numCells * (CELL_WIDTH + 0.5) - 0.5;
  const cellStartX = -totalCellsWidth / 2 + CELL_WIDTH / 2;
  
  // Cell center Z: bars at WALKWAY_WIDTH/2, back wall at WALKWAY_WIDTH/2 + CELL_DEPTH
  const cellZ = WALKWAY_WIDTH / 2 + CELL_DEPTH / 2;
  
  for (let i = 0; i < numCells; i++) {
    const cellX = cellStartX + i * (CELL_WIDTH + 0.5);
    
    createCellHorizontal(prisonGroup, colliders, npcColliders, wallMaterial, barMaterial,
      cellX, cellZ, CELL_WIDTH, CELL_DEPTH, CELL_HEIGHT, BAR_THICKNESS, BAR_SPACING);
  }
  
  return { prisonGroup, colliders, npcColliders };
}

/**
 * Creates a single cell with walls and bars, facing negative Z (into the corridor)
 * Cells are lined up horizontally (side by side along X axis)
 */
function createCellHorizontal(group, colliders, npcColliders, wallMaterial, barMaterial, x, z, width, depth, height, barThickness, barSpacing) {
  // Back wall (at positive Z, against the corridor wall)
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.3),
    wallMaterial
  );
  backWall.position.set(x, height/2, z + depth/2);
  group.add(backWall);
  colliders.push({
    min: new THREE.Vector3(x - width/2, 0, z + depth/2 - 0.15),
    max: new THREE.Vector3(x + width/2, height, z + depth/2 + 0.15)
  });
  npcColliders.push(
    new THREE.Box3(
      new THREE.Vector3(x - width/2, 0, z + depth/2 - 0.15),
      new THREE.Vector3(x + width/2, height, z + depth/2 + 0.15)
    )
  );
  
  // Left side wall
  const leftSideWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, height, depth),
    wallMaterial
  );
  leftSideWall.position.set(x - width/2, height/2, z);
  group.add(leftSideWall);
  colliders.push({
    min: new THREE.Vector3(x - width/2 - 0.15, 0, z - depth/2),
    max: new THREE.Vector3(x - width/2 + 0.15, height, z + depth/2)
  });
  npcColliders.push(
    new THREE.Box3(
      new THREE.Vector3(x - width/2 - 0.15, 0, z - depth/2),
      new THREE.Vector3(x - width/2 + 0.15, height, z + depth/2)
    )
  );
  
  // Right side wall
  const rightSideWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, height, depth),
    wallMaterial
  );
  rightSideWall.position.set(x + width/2, height/2, z);
  group.add(rightSideWall);
  colliders.push({
    min: new THREE.Vector3(x + width/2 - 0.15, 0, z - depth/2),
    max: new THREE.Vector3(x + width/2 + 0.15, height, z + depth/2)
  });
  npcColliders.push(
    new THREE.Box3(
      new THREE.Vector3(x + width/2 - 0.15, 0, z - depth/2),
      new THREE.Vector3(x + width/2 + 0.15, height, z + depth/2)
    )
  );
  
  // Cell bars (vertical bars across the front opening, facing -Z into corridor)
  const numBars = Math.floor(width / (barThickness + barSpacing));
  const barStartX = x - width/2 + barThickness/2 + 0.1;
  
  for (let i = 0; i < numBars; i++) {
    const barX = barStartX + i * (barThickness + barSpacing);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(barThickness, height * 0.9, barThickness),
      barMaterial
    );
    bar.position.set(barX, height * 0.45, z - depth/2);
    group.add(bar);
  }
  
  // Single collider for the bar wall (simpler than individual bars)
  colliders.push({
    min: new THREE.Vector3(x - width/2, 0, z - depth/2 - barThickness/2),
    max: new THREE.Vector3(x + width/2, height, z - depth/2 + barThickness/2)
  });
  npcColliders.push(
    new THREE.Box3(
      new THREE.Vector3(x - width/2, 0, z - depth/2 - barThickness/2),
      new THREE.Vector3(x + width/2, height, z - depth/2 + barThickness/2)
    )
  );
}
