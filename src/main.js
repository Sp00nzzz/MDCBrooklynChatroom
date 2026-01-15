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
  updateKoolAidAudio
} from './audio/proximityAudio.js';

// Game state
let gameStarted = false;
let scene, camera, renderer, player, npcs, npcMap, clock, gameStartTime, chatUI, nextMessageTime;
let backgroundMusic = null;

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
  
  // Update camera view preview (only renders when enabled for performance)
  // This call is cheap when disabled - it returns immediately
  if (isCameraViewEnabled()) {
    updateCameraView();
  }
  
    // Render main scene to screen
    renderer.render(scene, camera);
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Handle ESC key to unlock pointer
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && player.controls.isLocked) {
      player.controls.unlock();
    }
  });

  // Handle E key to toggle camera view (handheld camcorder UI)
  // This does NOT interfere with pointer lock - camera is visual only
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE') {
      toggleCameraView();
    }
  });

  // Handle F key to toggle coordinate indicator visibility
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyF') {
      const coordIndicator = document.getElementById('coordinate-indicator');
      if (coordIndicator) {
        coordIndicator.style.display = coordIndicator.style.display === 'none' ? 'block' : 'none';
      }
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
        document.getElementById('coordinate-indicator')?.classList.add('visible');
        document.getElementById('clock-indicator')?.classList.add('visible');
        document.getElementById('location-indicator')?.classList.add('visible');
        
        // Initialize game (this shows canvas and starts rendering the scene)
        initGame();
        
        // Start background music when eyelid animation begins
        backgroundMusic = new Audio('/background music.mp3');
        backgroundMusic.loop = true;
        backgroundMusic.volume = 0; // Start at 0 for fade-in
        
        // Play music (with error handling in case file doesn't exist)
        backgroundMusic.play().catch(error => {
          console.warn('Could not play background music:', error);
        });
        
        // Fade in the music over 3 seconds
        const targetVolume = 0.5; // Target volume at 50%
        const fadeDuration = 3000; // 3 seconds
        const fadeStartTime = performance.now();
        
        function fadeInMusic() {
          const elapsed = performance.now() - fadeStartTime;
          const progress = Math.min(elapsed / fadeDuration, 1);
          
          // Ease-in for smooth fade
          const easedProgress = easeInQuad(progress);
          backgroundMusic.volume = targetVolume * easedProgress;
          
          if (progress < 1) {
            requestAnimationFrame(fadeInMusic);
          }
        }
        
        // Start fade-in animation
        fadeInMusic();
        
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
