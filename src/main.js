import * as THREE from 'three';
import { createPrison } from './prison.js';
import { createPlayer } from './player.js';
import { NPCSprite } from './npc.js';
import ChatUI from './chat/chatUI.js';
import { generateMessage, getRandomInterval } from './chat/chat.js';
import { 
  createDialogueBubble, 
  updateBubbleBillboard, 
  updateBubbleLifetime, 
  disposeBubble 
} from './dialogueBubble.js';
// Camera View UI - handheld camcorder overlay
import { 
  initCameraView, 
  toggleCameraView, 
  updateCameraView, 
  isCameraViewEnabled 
} from './ui/cameraView.js';
// Eye Opening Transition
import { 
  initEyeOpenTransition, 
  playEyeOpenTransition 
} from './ui/eyeOpenTransition.js';
// Proximity Audio for NPCs
import { 
  initDiddyAudio, 
  updateDiddyAudio,
  initKoolAidAudio,
  updateKoolAidAudio,
  init6ix9ineAudio,
  update6ix9ineAudio,
  initMaduroAudio,
  updateMaduroAudio,
  initCohenAudio,
  updateCohenAudio
} from './audio/proximityAudio.js';
// Hotbar UI - item selection slots at bottom of screen
import { 
  initHotbar, 
  setSelectedSlot, 
  getSelectedSlot,
  getSelectedItemType,
  setSlotItem
} from './ui/hotbar.js';
import './ui/anger.css';
import { initAngerSystem, updateAnger, isFightActive } from './ui/angerSystem.js';
// Baby Oil item - squirts white splats on surfaces
import {
  initBabyOil,
  setSelected as setBabyOilSelected,
  setSqueezing as setBabyOilSqueezing,
  update as updateBabyOil,
  addRaycastTargets
} from './items/babyoilItem.js';
// Marlboro item - shows smoking hand HUD
import {
  initMarlboro,
  setSelected as setMarlboroSelected,
  update as updateMarlboro,
  handleClick as handleMarlboroClick
} from './items/marlboroItem.js';
// Oil Squirt VFX - visual particle effect for baby oil
import {
  initOilSquirtVfx,
  update as updateOilSquirtVfx,
  updateNozzlePosition
} from './vfx/oilSquirtVfx.js';
// Smoke VFX - cigarette smoke puffs
import {
  initSmokeVfx,
  spawnSmokePuff,
  updateSmokeVfx
} from './vfx/smokeVfx.js';
// Confetti VFX - 3D world-space celebration effect
import {
  initConfettiVfx,
  updateWorldConfetti
} from './vfx/confettiVfx.js';
// Push Interaction - NPC push system with hand overlay
import {
  initPushInteraction,
  updatePushInteraction,
  cleanupPushInteraction,
  isPushActive
} from './pushInteraction.js';
// Low-poly wooden table with baby oil images
import { createTable, updateTablePickup, createTableCollider, checkTablePickup } from './table.js';
// Settings UI - top right settings panel with master volume control
import {
  initSettings,
  showSettings,
  getMasterVolume,
  onVolumeChange
} from './ui/settings.js';

// Game state
let gameStarted = false;
let scene, camera, renderer, player, npcs, npcMap, clock, gameStartTime, chatUI, nextMessageTime;
let backgroundMusic = null;
// Track player position for movement detection (baby oil HUD bob)
let lastPlayerPosition = new THREE.Vector3();

// Initialize game function - called when start screen is clicked
function initGame() {
  if (gameStarted) return;
  gameStarted = true;

  // Scene setup - lighter gray background
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x4a4a4a);
  scene.fog = new THREE.Fog(0x4a4a4a, 40, 100);

  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  // Audio listener for positional audio (attached to camera)
  const audioListener = new THREE.AudioListener();
  camera.add(audioListener);

  // Renderer
  const container = document.getElementById('canvas-container');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Lighting - brighter for visibility
  const ambientLight = new THREE.AmbientLight(0x606060, 1.0);
  scene.add(ambientLight);

  // Add a directional light for overall illumination
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight.position.set(0, 10, 0);
  directionalLight.castShadow = false;
  scene.add(directionalLight);

  // Add overhead lights along the corridor - brighter with wider range
  const lightSpacing = 8;
  const numLights = 8;
  for (let i = 0; i < numLights; i++) {
    const light = new THREE.PointLight(0xffffff, 2.0, 30);
    const x = -30 + i * lightSpacing;
    light.position.set(x, 4.5, 0);
    light.castShadow = false;
    scene.add(light);
  }

  // Create prison
  const { prisonGroup, colliders, npcColliders } = createPrison();
  scene.add(prisonGroup);

  // Create wooden table with baby oil images
  // Placed in the walkway area at X = 29, Z = -0.93, rotated 90 degrees
  const tablePosition = new THREE.Vector3(29, 0, -0.93);
  const table = createTable(tablePosition, '/babyoil.png', 'babyoil');
  table.rotation.y = Math.PI / 2; // Rotate 90 degrees around Y axis
  scene.add(table);

  // Add table collision - single bounding box covering entire table volume
  // isRotated90 = true because table is rotated 90 degrees on Y axis (swaps width/depth)
  const tableCollider = createTableCollider(tablePosition, true);
  colliders.push(tableCollider);

  // Create second wooden table with cigarettes image
  // Placed at X = -6.5, Y = 0, Z = -6.5, rotated 180 degrees
  const table2Position = new THREE.Vector3(-6.5, 0, -6.5);
  const table2 = createTable(table2Position, '/icon/cigs.png', 'marlboro');
  table2.rotation.y = Math.PI; // Rotate 180 degrees around Y axis
  scene.add(table2);

  // Add second table collision - single bounding box covering entire table volume
  // isRotated90 = false because table is rotated 180 degrees on Y axis (back to original orientation)
  const table2Collider = createTableCollider(table2Position, false);
  colliders.push(table2Collider);

  // Create poster on the wall above the cigarette table
  // Left wall is at Z = -7.25, table is at X = -6.5, Z = -6.5
  // Position poster at same X as table, on the wall surface, above the table
  const textureLoader = new THREE.TextureLoader();
  const posterTexture = textureLoader.load('/beastgames.jpg');
  posterTexture.colorSpace = THREE.SRGBColorSpace;
  
  const posterMaterial = new THREE.MeshStandardMaterial({
    map: posterTexture,
    emissiveMap: posterTexture,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.8,
    transparent: false
  });
  
  // Create a plane for the poster (width x height)
  const posterWidth = 3.0;
  const posterHeight = 2.5;
  const posterGeometry = new THREE.PlaneGeometry(posterWidth, posterHeight);
  const poster = new THREE.Mesh(posterGeometry, posterMaterial);
  
  // Position: same X as table (-6.5), on wall surface (Z = -6.5, slightly in front of wall at -7.25)
  // Y position: 2.5 units high (above the table which is ~0.85 units tall)
  poster.position.set(-6.5, 2.5, -6.98);
  
  // Rotate to face the walkway (toward positive Z)
  poster.rotation.y = 0; // Already facing the right direction
  
  scene.add(poster);

  // Create player
  player = createPlayer(camera, renderer.domElement, colliders);

  // Create NPCs - positioned in the walkway (Z from -4 to +4)
  // NPCSprite constructor: (position, textureOrPath, colliders, characterName)
  // Map image paths to character names for dialogue linking
  npcs = [
    new NPCSprite(new THREE.Vector3(-15, 1.5, 0), '/SBF.png', npcColliders, 'Sam Bankman-Fried'),
    new NPCSprite(new THREE.Vector3(5, 1.5, -1), '/Luigi.png', npcColliders, 'Luigi Mangione'),
    new NPCSprite(new THREE.Vector3(-5, 1.5, 1), '/madurofront.png', npcColliders, 'Nicolas Maduro'),
    new NPCSprite(new THREE.Vector3(10, 1.5, 2), '/diddy.png', npcColliders, 'Sean Comb'),
    new NPCSprite(new THREE.Vector3(-10, 1.5, -2), '/GM.png', npcColliders, 'Ghislaine Maxwell'),
    new NPCSprite(new THREE.Vector3(15, 1.5, -2), '/ElChapo.png', npcColliders, 'El Chapo Guzman'),
    new NPCSprite(new THREE.Vector3(-20, 1.5, 2), '/Rkelly.png', npcColliders, 'R. Kelly'),
    new NPCSprite(new THREE.Vector3(20, 1.5, 1), '/AndyCohen.png', npcColliders, 'Andy Cohen'),
    new NPCSprite(new THREE.Vector3(-25, 1.5, -1), '/6ix9ine.png', npcColliders, '6ix9ine'),
    new NPCSprite(new THREE.Vector3(25, 1.5, 0), '/koolaid.png', npcColliders, 'Kool-Aid Man'),
    new NPCSprite(new THREE.Vector3(0, 1.5, 3), '/Martin.png', npcColliders, 'Martin'),
  ];

  // Create a map from character name to NPC for quick lookup
  npcMap = new Map();
  npcs.forEach(npc => {
    if (npc.characterName) {
      npcMap.set(npc.characterName, npc);
    }
  });

  // Make Martin and Kool-Aid Man wider
  const martinNPC = npcs[npcs.length - 1]; // Martin is the last one
  martinNPC.getSprite().scale.set(3, 3, 1); // Wider: increased from 3.0 to 4.5
  
  const koolAidNPC = npcs.find(npc => npc.isKoolAidMan);
  if (koolAidNPC) {
    koolAidNPC.getSprite().scale.set(3, 3, 1); // Make Kool-Aid Man wider too
  }

  // Add NPCs to scene
  npcs.forEach(npc => {
    scene.add(npc.getSprite());
  });

  // Initialize anger system UI and fight logic
  initAngerSystem({
    npcs,
    getPlayerPosition: () => camera.position,
    setMovementLocked: (locked) => player.setMovementLocked(locked),
    camera: camera,
    setCameraLocked: (locked) => player.setCameraLocked(locked)
  });

  // Find and initialize Diddy NPC audio
  const diddyNpc = npcs.find(npc => npc.isDiddy);
  if (diddyNpc) {
    initDiddyAudio(audioListener, diddyNpc);
  } else {
    console.warn('Diddy NPC not found - proximity audio will not be available');
  }

  // Find and initialize Kool-Aid Man NPC audio
  const koolAidNpc = npcs.find(npc => npc.isKoolAidMan);
  if (koolAidNpc) {
    initKoolAidAudio(audioListener, koolAidNpc);
  } else {
    console.warn('Kool-Aid Man NPC not found - proximity audio will not be available');
  }

  // Find and initialize 6ix9ine NPC audio
  const sixix9ineNpc = npcs.find(npc => npc.is6ix9ine);
  if (sixix9ineNpc) {
    init6ix9ineAudio(audioListener, sixix9ineNpc);
  } else {
    console.warn('6ix9ine NPC not found - proximity audio will not be available');
  }

  // Find and initialize Maduro NPC audio
  const maduroNpc = npcs.find(npc => npc.isMaduro);
  if (maduroNpc) {
    initMaduroAudio(audioListener, maduroNpc);
  } else {
    console.warn('Maduro NPC not found - proximity audio will not be available');
  }

  // Find and initialize Cohen NPC audio
  const cohenNpc = npcs.find(npc => npc.isCohen);
  if (cohenNpc) {
    initCohenAudio(audioListener, cohenNpc);
  } else {
    console.warn('Cohen NPC not found - proximity audio will not be available');
  }

  // Initialize push interaction system
  initPushInteraction(npcs, camera, player.controls);

  // Clock for delta time
  clock = new THREE.Clock();

  // Game time clock - starts at 9:00 AM, increments 1 hour every 90 seconds
  gameStartTime = Date.now();
  const GAME_HOUR_DURATION_MS = 90 * 1000; // 1.5 minutes = 90 seconds in milliseconds

  function formatGameTime() {
    const elapsedMs = Date.now() - gameStartTime;
    const gameHoursPassed = Math.floor(elapsedMs / GAME_HOUR_DURATION_MS);
    const gameHour = 9 + gameHoursPassed; // Start at 9 AM
    
    // Handle 12-hour format with AM/PM
    let displayHour = gameHour % 12;
    if (displayHour === 0) displayHour = 12;
    const period = gameHour >= 12 ? 'PM' : 'AM';
    
    return `${displayHour}:00${period}`;
  }

  // Initialize camera view system (handheld camcorder UI)
  // This sets up the render-to-texture pipeline for the live preview
  initCameraView(renderer, scene, camera);

  // Initialize hotbar UI (5 slots at bottom of screen)
  // Slot 1 contains the Camera item by default
  initHotbar();
  
  // Initialize settings UI (top right settings panel)
  initSettings();
  showSettings();
  
  // Initialize Baby Oil item system
  // Collect raycast targets: floor, walls, ceiling, table from prisonGroup
  const raycastTargets = [];
  prisonGroup.traverse((child) => {
    if (child.isMesh) {
      raycastTargets.push(child);
    }
  });
  // Also add the table meshes
  table.traverse((child) => {
    if (child.isMesh) {
      raycastTargets.push(child);
    }
  });
  // Also add the second table meshes
  table2.traverse((child) => {
    if (child.isMesh) {
      raycastTargets.push(child);
    }
  });
  // Add poster to raycast targets so splats can spawn on it
  raycastTargets.push(poster);
  
  initBabyOil({ scene, camera, raycastTargets });
  
  // Initialize Marlboro item system
  initMarlboro();
  
  // Initialize Oil Squirt VFX system
  initOilSquirtVfx();
  
  // Initialize Smoke VFX system
  initSmokeVfx(scene);

  // Initialize Confetti VFX system
  initConfettiVfx(scene);

  // Animation loop
  function animate() {
  requestAnimationFrame(animate);
  
  let deltaTime = clock.getDelta();
  
  // Clamp deltaTime to prevent huge jumps when tab regains focus after alt-tab
  // This prevents NPCs from moving huge distances or disappearing
  const maxDeltaTime = 0.1; // Maximum 100ms per frame (10 FPS minimum)
  if (deltaTime > maxDeltaTime) {
    deltaTime = maxDeltaTime;
  }
  
  // Check if fight is active - skip most updates during fight
  const fightActive = isFightActive();
  
  if (!fightActive) {
    // Normal gameplay updates
    // Update player
    player.update(deltaTime);
    
    // Update coordinate indicator
    const coordIndicator = document.getElementById('coordinate-indicator');
    if (coordIndicator) {
      const pos = camera.position;
      coordIndicator.textContent = `X: ${pos.x.toFixed(2)} Y: ${pos.y.toFixed(2)} Z: ${pos.z.toFixed(2)}`;
    }
    
    // Update clock indicator
    const clockIndicator = document.getElementById('clock-indicator');
    if (clockIndicator) {
      clockIndicator.textContent = formatGameTime();
    }
    
    // Update NPCs (billboard to face camera and update dialogue bubbles)
    npcs.forEach(npc => {
      npc.update(
        deltaTime, 
        camera, 
        updateBubbleBillboard, 
        updateBubbleLifetime, 
        disposeBubble, 
        scene
      );
    });
    
    // Update NPC proximity audio
    updateDiddyAudio(deltaTime, camera.position);
    updateKoolAidAudio(deltaTime, camera.position);
    update6ix9ineAudio(deltaTime, camera.position);
    updateMaduroAudio(deltaTime, camera.position);
    updateCohenAudio(deltaTime, camera.position);
    
    // Update push interaction system
    updatePushInteraction(deltaTime, camera.position);
    
    // Update floating baby oil pickup animation (bobbing)
    updateTablePickup(deltaTime);
    
    // Check if player touched any table to pick up an item
    const pickedUpItemType = checkTablePickup(camera.position, scene);
    if (pickedUpItemType === 'babyoil') {
      // Baby oil was just picked up - add it to hotbar slot 2
      setSlotItem(2, 'babyoil', '/babyoil.png');
    } else if (pickedUpItemType === 'marlboro') {
      // Marlboro was just picked up - add it to hotbar slot 3
      setSlotItem(3, 'marlboro', '/icon/cigs.png');
    }
    
    // Update camera view preview (only renders when enabled for performance)
    // This call is cheap when disabled - it returns immediately
    if (isCameraViewEnabled()) {
      updateCameraView();
    }
    
    // Update baby oil item (splat spawning and HUD animation)
    // Detect movement by comparing camera position
    const currentPos = camera.position;
    const isPlayerMoving = currentPos.distanceToSquared(lastPlayerPosition) > 0.0001;
    lastPlayerPosition.copy(currentPos);
    updateBabyOil(deltaTime, isPlayerMoving);
    
    // Update marlboro item (HUD animation)
    updateMarlboro(deltaTime, isPlayerMoving);
    
    // Update oil squirt VFX particles
    updateOilSquirtVfx(deltaTime);
    
    // Update smoke VFX particles
    updateSmokeVfx(deltaTime);
    
    // Update confetti VFX particles
    updateWorldConfetti(deltaTime);
    
    // Render main scene to screen
    renderer.render(scene, camera);
  } else {
    // During fight: render scene with opponent visible
    // The overlay covers UI, but opponent should be visible
    // Set dark background to match fight aesthetic
    renderer.setClearColor(0x0a0a0a, 1);
    
    // Update confetti even during fight (in case win happens)
    updateWorldConfetti(deltaTime);
    
    renderer.render(scene, camera);
  }

  // Update anger system (handles fight logic and triggers)
  // This must run even during fight to update fight state
  updateAnger(deltaTime);
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Update VFX nozzle position
    updateNozzlePosition();
  });

  // Handle ESC key to unlock pointer
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && player.controls.isLocked) {
      player.controls.unlock();
    }
  });

  // Handle F key to toggle coordinate indicator visibility
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyF') {
      const coordIndicator = document.getElementById('coordinate-indicator');
      if (coordIndicator) {
        // Check if currently visible (either via class or inline style)
        const isVisible = coordIndicator.classList.contains('visible') || 
                         (coordIndicator.style.display !== 'none' && coordIndicator.style.display !== '');
        if (isVisible) {
          // Hide it
          coordIndicator.classList.remove('visible');
          coordIndicator.style.display = 'none';
        } else {
          // Show it
          coordIndicator.classList.add('visible');
          coordIndicator.style.display = 'block';
        }
      }
    }
  });

  // Track UI visibility state for 'b' key toggle
  let uiHidden = false;
  const uiVisibilityState = new Map(); // Store original visibility state for each element
  const npcVisibilityState = new Map(); // Store original visibility state for each NPC

  // Handle B key to toggle all UI visibility and NPCs
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyB' && !event.repeat) {
      uiHidden = !uiHidden;
      
      // List of all UI element selectors to toggle
      const uiElements = [
        '#hotbar-container',
        '#settings-container',
        '#camera-view-container',
        '#chat-container',
        '#anger-ui',
        '#coordinate-indicator',
        '#clock-indicator',
        '#location-indicator',
        '#held-item-hud'
      ];
      
      uiElements.forEach(selector => {
        const element = document.querySelector(selector);
        if (!element) return;
        
        if (uiHidden) {
          // Hide: store current visibility state
          const computedStyle = window.getComputedStyle(element);
          const state = {
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity,
            hasVisibleClass: element.classList.contains('visible'),
            originalDisplay: element.style.display || '',
            originalVisibility: element.style.visibility || '',
            originalOpacity: element.style.opacity || ''
          };
          uiVisibilityState.set(selector, state);
          
          // Hide the element
          element.style.display = 'none';
        } else {
          // Show: restore original visibility state
          const state = uiVisibilityState.get(selector);
          if (state) {
            // Restore inline styles
            element.style.display = state.originalDisplay || state.display;
            element.style.visibility = state.originalVisibility || state.visibility;
            element.style.opacity = state.originalOpacity || state.opacity;
            
            // Restore 'visible' class for indicators that use it
            if (state.hasVisibleClass) {
              element.classList.add('visible');
            }
          } else {
            // Fallback: show element with default display
            element.style.display = '';
          }
        }
      });
      
      // Toggle NPC visibility
      if (npcs) {
        npcs.forEach((npc, index) => {
          const sprite = npc.getSprite();
          if (!sprite) return;
          
          if (uiHidden) {
            // Hide: store original visibility state
            if (!npcVisibilityState.has(index)) {
              npcVisibilityState.set(index, sprite.visible);
            }
            sprite.visible = false;
          } else {
            // Show: restore original visibility state
            const originalVisible = npcVisibilityState.get(index);
            if (originalVisible !== undefined) {
              sprite.visible = originalVisible;
            } else {
              // Fallback: show NPC (default is visible)
              sprite.visible = true;
            }
          }
        });
      }
      
      // Note: We don't toggle #ddr-fight-overlay as it's controlled by the fight system
      // and should only be shown/hidden by the anger system logic
    }
  });

  // Handle 1-5 keys for hotbar slot selection
  // Slot 1 = Camera: brings up camera when selected, puts it down when deselected
  // Slot 2 = Baby Oil (when picked up): shows HUD and enables squeezing
  // This does NOT interfere with pointer lock or mouse look
  document.addEventListener('keydown', (event) => {
    // Check for digit keys 1-5 (both main keyboard and numpad)
    const key = event.key;
    if (key >= '1' && key <= '5') {
      const slotIndex = parseInt(key, 10);
      const previousSlot = getSelectedSlot();
      const previousItemType = getSelectedItemType();
      const isNowSelected = setSelectedSlot(slotIndex);
      const newItemType = getSelectedItemType();
      
      // If push is active, allow logical state change but don't show visuals
      // Visuals will be restored correctly when push ends
      if (isPushActive()) {
        // Still update item selection state logically
        // The setSelected functions will handle not showing visuals during push
        if (previousItemType === 'babyoil' && newItemType !== 'babyoil') {
          setBabyOilSelected(false, true);
        }
        if (previousItemType === 'marlboro' && newItemType !== 'marlboro') {
          setMarlboroSelected(false, true);
        }
        if (newItemType === 'babyoil') {
          setBabyOilSelected(true, true);
        }
        if (newItemType === 'marlboro') {
          setMarlboroSelected(true, true);
        }
        return; // Don't show visuals during push
      }
      
      // Detect if we're switching between items (not unequipping to empty)
      const isSwitchingItems = previousItemType !== null && 
                                newItemType !== null && 
                                previousItemType !== newItemType;
      
      // CRITICAL: Hide outgoing items BEFORE showing incoming items
      // This prevents overlay issues where multiple items are visible simultaneously
      
      // Handle baby oil deselection (hide first)
      if (previousItemType === 'babyoil' && newItemType !== 'babyoil') {
        setBabyOilSelected(false, isSwitchingItems);
      }
      
      // Handle marlboro deselection (hide first)
      if (previousItemType === 'marlboro' && newItemType !== 'marlboro') {
        setMarlboroSelected(false, isSwitchingItems);
      }
      
      // Handle camera deselection (hide first when switching away)
      if (previousSlot === 1 && isCameraViewEnabled() && slotIndex !== 1) {
        // Switching away from slot 1: put camera down
        // Use instant switching if we're switching to another item
        toggleCameraView(isSwitchingItems);
      }
      
      // NOW show incoming items (after outgoing items are hidden)
      // Synchronous execution ensures proper ordering
      
      // Handle camera for slot 1
      if (slotIndex === 1) {
        // Pressing 1: toggle camera based on selection state
        if (isNowSelected && !isCameraViewEnabled()) {
          // Final check: ensure held item HUD is hidden before showing camera
          const hudEl = document.getElementById('held-item-hud');
          if (hudEl && hudEl.style.display !== 'none') {
            hudEl.style.transition = 'none';
            hudEl.style.display = 'none';
            hudEl.style.transform = 'translateY(100%)';
            hudEl.offsetHeight; // Force reflow
          }
          toggleCameraView(isSwitchingItems); // Bring camera up
        } else if (!isNowSelected && isCameraViewEnabled()) {
          toggleCameraView(isSwitchingItems); // Put camera down
        }
      }
      
      // Handle baby oil selection (show after camera is handled)
      if (newItemType === 'babyoil') {
        // Final check: ensure camera is hidden before showing HUD
        const cameraEl = document.getElementById('camera-view-container');
        if (cameraEl && cameraEl.style.display !== 'none') {
          cameraEl.style.transition = 'none';
          cameraEl.style.display = 'none';
          cameraEl.style.transform = 'translateY(100%)';
          cameraEl.offsetHeight; // Force reflow
        }
        setBabyOilSelected(true, isSwitchingItems);
      }
      
      // Handle marlboro selection (show after camera is handled)
      if (newItemType === 'marlboro') {
        // Final check: ensure camera is hidden before showing HUD
        const cameraEl = document.getElementById('camera-view-container');
        if (cameraEl && cameraEl.style.display !== 'none') {
          cameraEl.style.transition = 'none';
          cameraEl.style.display = 'none';
          cameraEl.style.transform = 'translateY(100%)';
          cameraEl.offsetHeight; // Force reflow
        }
        setMarlboroSelected(true, isSwitchingItems);
      }
    }
  });
  
  // Handle mouse input for baby oil squeezing and marlboro clicking
  // Only active when items are selected and pointer is locked
  document.addEventListener('mousedown', (event) => {
    if (event.button === 0 && player.controls.isLocked) {
      // Left mouse button
      if (getSelectedItemType() === 'babyoil') {
        setBabyOilSqueezing(true);
      } else if (getSelectedItemType() === 'marlboro') {
        handleMarlboroClick();
        
        // Spawn smoke puff at camera position (in front and slightly down)
        // Calculate world position in front of camera
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const up = camera.up.clone();
        
        // Position: 0.5 units forward, 0.3 units down from camera
        const smokeOffset = forward.multiplyScalar(0.5)
          .add(up.multiplyScalar(-0.3));
        const smokePos = camera.position.clone().add(smokeOffset);
        
        spawnSmokePuff(smokePos);
      }
    }
  });
  
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      // Left mouse button released
      setBabyOilSqueezing(false);
    }
  });

  // Initialize chat system
  chatUI = new ChatUI();

  // Chat message generation loop
  nextMessageTime = Date.now() + getRandomInterval();

  function updateChat() {
    const now = Date.now();
    if (now >= nextMessageTime) {
      const message = generateMessage();
      chatUI.addMessage(message.name, message.text, message.color);
      
      // Show dialogue bubble above the corresponding NPC
      // NPC lookup: Find NPC that matches the speaker's character name
      const npc = npcMap.get(message.name);
      if (npc) {
        npc.showDialogue(message.text, createDialogueBubble, scene, disposeBubble);
      }
      
      nextMessageTime = now + getRandomInterval();
    }
  }

  // Show canvas container
  container.classList.add('visible');

  // Start animation
  animate();

  // Start chat update loop (runs independently of animation frame)
  setInterval(updateChat, 100); // Check every 100ms for new messages
}

// Easing function for smooth fade-in
function easeInQuad(t) {
  return t * t;
}

// Set up start screen click handler
// Wait for DOM to be ready (though module scripts should already be ready)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupStartScreen);
} else {
  setupStartScreen();
}

function setupStartScreen() {
  // Initialize the eye opening transition system
  initEyeOpenTransition();
  
  const startScreen = document.getElementById('start-screen');
  if (startScreen) {
    startScreen.addEventListener('click', () => {
      // Start fade out transition (1 second)
      startScreen.classList.add('fading');
      
      // Wait for fade to complete before initializing game
      startScreen.addEventListener('transitionend', () => {
        // Hide start screen after fade completes
        startScreen.classList.add('hidden');
        
        // Show the UI indicators now that the start screen is gone
        // Note: coordinate-indicator is NOT shown by default - user must press F to toggle it
        document.getElementById('clock-indicator')?.classList.add('visible');
        document.getElementById('location-indicator')?.classList.add('visible');
        
        // Initialize game (this shows canvas and starts rendering the scene)
        initGame();
        
        // Start background music when eyelid animation begins
        backgroundMusic = new Audio('/background music.mp3');
        backgroundMusic.loop = true;
        const baseVolume = 0.5; // Base volume at 50%
        backgroundMusic.volume = baseVolume * getMasterVolume(); // Start at 50%
        
        // Play music (with error handling in case file doesn't exist)
        backgroundMusic.play().catch(error => {
          console.warn('Could not play background music:', error);
        });
        
        // Register callback to update background music when master volume changes
        onVolumeChange((newVolume) => {
          if (backgroundMusic) {
            backgroundMusic.volume = baseVolume * newVolume;
          }
        });
        
        // Play the cinematic eye opening transition to reveal the scene
        // Effects: eyelids opening, blur clearing, ghosting fading, vignette fading
        // The scene is already rendering behind the transition overlays
        playEyeOpenTransition({
          onComplete: () => {
            // Transition complete - all effects cleared
            // Game is already running, player can click to enable pointer lock
          }
        });
      }, { once: true });
    });
  }
}
