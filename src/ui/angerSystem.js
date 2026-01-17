// Anger bar system + DDR fight system

import * as THREE from 'three';
import { getLastPushedNPC } from '../pushInteraction.js';

export const anger = {
  value: 0,
  comboWindowMs: 1200,
  lastPushTime: 0,
  comboCount: 0,
  isFightActive: false
};

const CONFIG = {
  baseIncrement: 0.08,
  comboBonus: 0.035,
  decayRate: 0.08,
  popDurationMs: 140
};

const FIGHT_CONFIG = {
  bpm: 120,
  hitWindowPerfect: 0.10, // ±100ms for perfect (more forgiving)
  hitWindowGood: 0.18,     // ±180ms for good (very forgiving)
  distanceWindowPx: 48,    // px distance window for forgiving spatial hits
  bufferMs: 120,           // input buffer window for early presses
  missWindow: 0.22,        // grace period after note time before miss
  noteCount: 24,
  approachTime: 1.7,       // Time for note to travel from spawn to receptor center (increased to match longer distance)
  travelDistance: 810,      // Visual travel distance in pixels (from top to receptor center)
  // Receptor center position: lane height (900px) - bottom offset (50px) - receptor height/2 (48px) = 802px from top
  receptorCenterY: 802,
  // Note center must align with receptor center when timeToHit = 0
  // Note is 70px tall, so its center is 35px from its top edge
  // When note center = receptor center (802px), note top = 802 - 35 = 767px
  noteCenterAtReceptor: 802,
  noteHeight: 70,
  spawnY: 0,                // Spawn position (note top): literally at the top of the screen (0px)
  scorePerfect: 100,
  scoreGood: 60,
  targetScore: 1200
};

let angerUI = null;
let angerFill = null;
let npcPool = [];
let getPlayerPosition = null;
let setMovementLocked = null;
let camera = null;
let setCameraLocked = null;
let opponentNPC = null;
let opponentStartPosition = null;
let opponentStartRotation = null;
let onWinCallback = null;

// Fight audio
let fightAudio = null;
let hurtSound = null;

// Fight state
const fight = {
  active: false,
  startPerf: 0, // performance.now() when fight starts
  bpm: FIGHT_CONFIG.bpm,
  notes: [],
  score: 0,
  combo: 0,
  hits: 0,
  misses: 0,
  lastHitTime: {},
  inputBuffer: {},
  receptorCenterY: FIGHT_CONFIG.receptorCenterY,
  resizeHandler: null,
  comboMilestones: new Set(), // Track which combo milestones have been reached
  hitStreak: 0, // Track consecutive successful hits for blood spray
  enemy: {
    maxHP: 100,
    hp: 100
  }
};

// Get current time in seconds since fight started (using performance.now() for accuracy)
function nowSec() {
  if (!fight.startPerf) return 0;
  return (performance.now() - fight.startPerf) / 1000;
}

// DDR UI elements
let fightUI = null;
let fightOverlay = null; // Full-screen overlay
let fightLaneContainer = null;
let npcOverlay = null; // NPC image overlay on left side
let hitPopLayer = null; // Container for punch pop overlays
let missFlashOverlay = null; // Red flash overlay for misses
let jumpscareFist = null; // Jumpscare fist overlay
let comboNotification = null; // Combo milestone notification
let bloodSprayContainer = null; // Container for blood spray particles
const activeBloodParticles = []; // Track active spray particles
const MAX_BLOOD_PARTICLES = 60; // Cap total active particles
let enemyHPBar = null; // Enemy health bar container
let enemyHPFill = null; // Enemy health bar fill element
let fightTitle = null; // Fight title image overlay
const laneElements = new Map();
const ARROW_DIRS = ['L', 'U', 'D', 'R'];
// Clean arrow icons using SVG
const ARROW_SVG = {
  L: '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M25 10 L15 20 L25 30" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  U: '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M20 10 L20 30 M10 20 L20 10 L30 20" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  D: '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M20 10 L20 30 M10 20 L20 30 L30 20" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  R: '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M15 10 L25 20 L15 30" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
const ARROW_COLORS = {
  L: '#ffffff',
  U: '#ffffff',
  D: '#ffffff',
  R: '#ffffff'
};

// Gameplay UI elements to hide during fight
let hiddenUIElements = [];
let canvasContainer = null;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColorHex(fromHex, toHex, t) {
  const f = parseInt(fromHex.replace('#', ''), 16);
  const tHex = parseInt(toHex.replace('#', ''), 16);
  const fr = (f >> 16) & 255;
  const fg = (f >> 8) & 255;
  const fb = f & 255;
  const tr = (tHex >> 16) & 255;
  const tg = (tHex >> 8) & 255;
  const tb = tHex & 255;
  const r = Math.round(lerp(fr, tr, t));
  const g = Math.round(lerp(fg, tg, t));
  const b = Math.round(lerp(fb, tb, t));
  return `rgb(${r}, ${g}, ${b})`;
}

function getReceptorCenterY() {
  return fight.receptorCenterY || FIGHT_CONFIG.receptorCenterY;
}

function cacheReceptorMetrics() {
  if (!fight.active) return;
  const laneEntry = laneElements.get('U') || laneElements.get('L') || laneElements.get('D') || laneElements.get('R');
  if (!laneEntry) return;
  const laneRect = laneEntry.lane.getBoundingClientRect();
  const receptorRect = laneEntry.receptor.getBoundingClientRect();
  if (laneRect.height > 0 && receptorRect.height > 0) {
    fight.receptorCenterY = receptorRect.top + receptorRect.height / 2 - laneRect.top;
  }
}

function createAngerUI() {
  if (angerUI) return;

  angerUI = document.createElement('div');
  angerUI.id = 'anger-ui';
  angerUI.className = 'anger-ui';

  const title = document.createElement('div');
  title.className = 'anger-title';
  title.textContent = 'ANGER';

  const frame = document.createElement('div');
  frame.className = 'anger-frame';

  angerFill = document.createElement('div');
  angerFill.id = 'anger-fill';
  angerFill.className = 'anger-fill';

  const shine = document.createElement('div');
  shine.className = 'anger-shine';

  const ticks = document.createElement('div');
  ticks.className = 'anger-ticks';

  frame.appendChild(angerFill);
  frame.appendChild(shine);
  frame.appendChild(ticks);

  angerUI.appendChild(title);
  angerUI.appendChild(frame);

  document.body.appendChild(angerUI);
}


function setAngerUI(value) {
  if (!angerFill) return;
  const normalized = clamp01(value);
  angerFill.style.setProperty('--anger-scale', normalized.toFixed(3));
  const bright = lerpColorHex('#6b0000', '#ff3b3b', normalized);
  angerFill.style.setProperty('--anger-bright', bright);
}

function popAngerFill() {
  if (!angerFill) return;
  angerFill.classList.remove('anger-pop');
  void angerFill.offsetWidth;
  angerFill.classList.add('anger-pop');
  setTimeout(() => {
    if (angerFill) {
      angerFill.classList.remove('anger-pop');
    }
  }, CONFIG.popDurationMs);
}


// ===========================================
// DDR FIGHT UI CREATION (FULL-SCREEN MODE)
// ===========================================

function createFightUI() {
  if (fightUI) return;

  // Create full-screen overlay that covers everything
  fightOverlay = document.createElement('div');
  fightOverlay.id = 'ddr-fight-overlay';
  fightOverlay.className = 'ddr-fight-overlay hidden';

  // Create fight UI container
  fightUI = document.createElement('div');
  fightUI.id = 'ddr-fight-ui';
  fightUI.className = 'ddr-fight-ui';

  // Lanes container (no title, score, or combo)
  fightLaneContainer = document.createElement('div');
  fightLaneContainer.className = 'ddr-lanes';

  ARROW_DIRS.forEach(dir => {
    const lane = document.createElement('div');
    lane.className = 'ddr-lane';
    lane.dataset.dir = dir;

    const receptor = document.createElement('div');
    receptor.className = 'ddr-receptor';
    receptor.innerHTML = ARROW_SVG[dir]; // Use SVG arrow icons
    receptor.dataset.dir = dir;
    receptor.style.borderColor = ARROW_COLORS[dir];
    receptor.style.color = '#ffffff'; // Arrow color
    lane.appendChild(receptor);

    fightLaneContainer.appendChild(lane);
    laneElements.set(dir, { lane, receptor });
  });

  fightUI.appendChild(fightLaneContainer);

  fightOverlay.appendChild(fightUI);
  document.body.appendChild(fightOverlay);
  
  // Create judgement text element (will be shown/hidden as needed)
  const judgementEl = document.createElement('div');
  judgementEl.id = 'ddr-judgement-text';
  judgementEl.className = 'ddr-judgement-text';
  fightUI.appendChild(judgementEl);
  
  // Create NPC overlay on left side
  npcOverlay = document.createElement('div');
  npcOverlay.id = 'ddr-npc-overlay';
  npcOverlay.className = 'ddr-npc-overlay';
  fightOverlay.appendChild(npcOverlay);
  
  // Create hit pop layer for punch feedback
  hitPopLayer = document.createElement('div');
  hitPopLayer.id = 'hit-pop-layer';
  hitPopLayer.className = 'hit-pop-layer';
  fightOverlay.appendChild(hitPopLayer);
  
  // Create miss flash overlay (red screen flash)
  missFlashOverlay = document.createElement('div');
  missFlashOverlay.id = 'miss-flash-overlay';
  missFlashOverlay.className = 'miss-flash-overlay';
  fightOverlay.appendChild(missFlashOverlay);
  
  // Create jumpscare fist overlay
  jumpscareFist = document.createElement('img');
  jumpscareFist.id = 'jumpscare-fist';
  jumpscareFist.className = 'jumpscare-fist';
  jumpscareFist.src = '/oppfist.png';
  jumpscareFist.draggable = false;
  fightOverlay.appendChild(jumpscareFist);
  
  // Create combo notification overlay (appears next to character)
  comboNotification = document.createElement('img');
  comboNotification.id = 'combo-notification';
  comboNotification.className = 'combo-notification';
  comboNotification.draggable = false;
  comboNotification.style.display = 'none';
  fightOverlay.appendChild(comboNotification);
  
  // Create blood spray container
  bloodSprayContainer = document.createElement('div');
  bloodSprayContainer.id = 'blood-spray-container';
  bloodSprayContainer.className = 'blood-spray-container';
  fightOverlay.appendChild(bloodSprayContainer);
  
  // Create fight title (Mortal Kombat style)
  fightTitle = document.createElement('img');
  fightTitle.id = 'fight-title';
  fightTitle.className = 'fight-title';
  fightTitle.src = '/fight.png';
  fightTitle.draggable = false;
  fightTitle.style.display = 'none';
  fightOverlay.appendChild(fightTitle);
  
  // Create enemy health bar
  enemyHPBar = document.createElement('div');
  enemyHPBar.id = 'enemy-hp';
  enemyHPBar.className = 'enemy-hp';
  
  const hpLabel = document.createElement('div');
  hpLabel.className = 'enemy-hp-label';
  hpLabel.textContent = 'HP';
  enemyHPBar.appendChild(hpLabel);
  
  const hpFrame = document.createElement('div');
  hpFrame.className = 'enemy-hp-frame';
  
  enemyHPFill = document.createElement('div');
  enemyHPFill.id = 'enemy-hp-fill';
  enemyHPFill.className = 'enemy-hp-fill';
  hpFrame.appendChild(enemyHPFill);
  
  const hpShine = document.createElement('div');
  hpShine.className = 'enemy-hp-shine';
  hpFrame.appendChild(hpShine);
  
  enemyHPBar.appendChild(hpFrame);
  fightOverlay.appendChild(enemyHPBar);
}

// ===========================================
// UI HIDING/SHOWING FOR FIGHT MODE
// ===========================================

function hideGameplayUI() {
  hiddenUIElements = [];
  
  // List of UI element IDs/selectors to hide
  const uiSelectors = [
    '#hotbar-container',
    '#chat-container',
    '#coordinate-indicator',
    '#clock-indicator',
    '#location-indicator',
    '#anger-ui',
    '#held-item-hud',
    '#camera-view-container',
    '#canvas-container' // Hide the 3D scene
  ];
  
  // Also hide settings if it has a specific ID/class
  const settingsEl = document.querySelector('.settings-container, #settings-container');
  if (settingsEl) {
    uiSelectors.push(settingsEl);
  }
  
  uiSelectors.forEach(selector => {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) {
      const wasVisible = el.style.display !== 'none' && !el.classList.contains('hidden');
      if (wasVisible) {
        hiddenUIElements.push({
          element: el,
          originalDisplay: el.style.display || '',
          hadHiddenClass: el.classList.contains('hidden')
        });
        el.style.display = 'none';
      }
    }
  });
}

function showGameplayUI() {
  // Restore all hidden UI elements
  hiddenUIElements.forEach(({ element, originalDisplay, hadHiddenClass }) => {
    if (originalDisplay) {
      element.style.display = originalDisplay;
    } else {
      element.style.display = '';
    }
    if (hadHiddenClass) {
      element.classList.add('hidden');
    }
  });
  hiddenUIElements = [];
}

// ===========================================
// OPPONENT POSITIONING
// ===========================================

function pickOpponent() {
  if (!npcPool || npcPool.length === 0) return null;

  const playerPos = getPlayerPosition ? getPlayerPosition() : null;
  let candidates = npcPool;

  if (playerPos) {
    const near = npcPool.filter(npc => npc.position.distanceTo(playerPos) < 9);
    if (near.length > 0) {
      candidates = near;
    }
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

function updateOpponentPosition() {
  if (!opponentNPC || !camera) return;

  // Position opponent 3 units in front of camera, centered
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const targetPos = camera.position.clone();
  targetPos.add(forward.multiplyScalar(3));
  targetPos.y = opponentStartPosition ? opponentStartPosition.y : 1.5;

  opponentNPC.position.copy(targetPos);

  // Face camera
  const dx = camera.position.x - opponentNPC.position.x;
  const dz = camera.position.z - opponentNPC.position.z;
  const yaw = Math.atan2(dx, dz) + Math.PI / 2;
  opponentNPC.getSprite().rotation.y = yaw;
}

// ===========================================
// RHYTHM SYSTEM
// ===========================================
// 
// ROOT CAUSE OF ORIGINAL BUG:
// The previous implementation used accumulated deltaTime (fight.elapsedTime += deltaTime)
// which could drift over time, especially at different framerates. Additionally, the
// hit detection was checking timeToHit but the visual positioning calculation used
// a different progress formula that didn't perfectly align. This caused hits to only
// register in the top portion of the receptor because the timing and visuals were
// slightly misaligned.
//
// FIX:
// - Switched to performance.now() for frame-rate independent, accurate timing
// - Unified timing: both visuals and hit detection use the same time source
// - When timeToHit = 0 (note.time = currentTime), note is visually at receptor center
// - Hit detection uses symmetric time windows based on |delta|, not position checks

function buildNotesPattern() {
  const beatInterval = 60 / fight.bpm;
  const notes = [];
  const leadIn = 2.0; // 2 second lead-in before first note
  
  // Random note count between 17 and 24 (inclusive)
  const noteCount = Math.floor(Math.random() * (24 - 17 + 1)) + 17;

  for (let i = 0; i < noteCount; i++) {
    const dir = ARROW_DIRS[Math.floor(Math.random() * ARROW_DIRS.length)];
    // Note time is when it should be hit (when it reaches receptor center)
    const time = leadIn + i * beatInterval;
    notes.push({
      id: i,
      dir,
      time, // Time in seconds from fight start when note should be hit
      hit: false,
      judged: false,
      el: null
    });
  }

  return notes;
}

function createNoteElement(note) {
  const laneEntry = laneElements.get(note.dir);
  if (!laneEntry) return;

  const el = document.createElement('div');
  el.className = 'ddr-note';
  el.innerHTML = ARROW_SVG[note.dir]; // Use SVG arrow icons
  el.dataset.dir = note.dir;
  el.style.borderColor = ARROW_COLORS[note.dir];
  el.style.backgroundColor = ARROW_COLORS[note.dir];
  el.style.color = '#000000'; // Black arrow for notes

  laneEntry.lane.appendChild(el);
  note.el = el;
}

function computeNoteCenterY(note, t) {
  const approachTime = FIGHT_CONFIG.approachTime;
  const spawnY = FIGHT_CONFIG.spawnY;
  const noteCenterOffset = FIGHT_CONFIG.noteHeight / 2;
  const timeToHit = note.time - t;
  const progress = 1 - (timeToHit / approachTime);
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const spawnCenterY = spawnY + noteCenterOffset;
  const targetReceptorCenterY = getReceptorCenterY();
  return spawnCenterY + (targetReceptorCenterY - spawnCenterY) * clampedProgress;
}

function isNoteOnScreen(note, t) {
  const spawnTime = note.time - FIGHT_CONFIG.approachTime;
  const missTime = note.time + FIGHT_CONFIG.missWindow;
  return t >= spawnTime && t <= missTime;
}

function findNearestNote(dir, t) {
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestAbsTime = Number.POSITIVE_INFINITY;

  for (const note of fight.notes) {
    if (note.judged || note.dir !== dir) continue;
    if (!isNoteOnScreen(note, t)) continue;

    const deltaTime = t - note.time;
    const absTime = Math.abs(deltaTime);
    const noteCenterY = computeNoteCenterY(note, t);
    const distPx = noteCenterY - getReceptorCenterY();
    const absDist = Math.abs(distPx);
    const score = Math.min(
      absTime / FIGHT_CONFIG.hitWindowGood,
      absDist / FIGHT_CONFIG.distanceWindowPx
    );

    if (score < bestScore || (score === bestScore && absTime < bestAbsTime)) {
      bestScore = score;
      bestAbsTime = absTime;
      best = {
        note,
        deltaTime,
        absTime,
        distPx,
        absDist
      };
    }
  }

  return best;
}

function removeNoteElement(note) {
  if (note.el && note.el.parentNode) {
    note.el.parentNode.removeChild(note.el);
  }
  note.el = null;
  note.pendingRemoval = false;
}

function snapNoteToReceptor(note) {
  if (!note.el) return;
  const noteTopY = getReceptorCenterY() - FIGHT_CONFIG.noteHeight / 2;
  note.el.style.transform = `translate3d(-50%, ${noteTopY}px, 0)`;
  note.el.style.opacity = '1';
  requestAnimationFrame(() => {
    removeNoteElement(note);
  });
}

function updateNotes() {
  // Use performance.now() for accurate timing
  const t = nowSec();
  const approachTime = FIGHT_CONFIG.approachTime;
  const noteHeight = FIGHT_CONFIG.noteHeight;
  const noteCenterOffset = noteHeight / 2; // 35px - distance from note top to note center

  for (const note of fight.notes) {
    // Skip judged notes immediately (they're already hit/missed)
    if (note.judged) {
      // Ensure hit notes are immediately hidden
      if (note.el && !note.pendingRemoval) {
        note.el.style.opacity = '0';
      }
      continue;
    }

    // Calculate time until note should be hit
    const timeToHit = note.time - t;
    
    // Spawn note when it's time to start approaching
    const spawnTime = note.time - approachTime;
    // Note is visible from spawn until it passes the hit window
    // Extend visibility slightly past hit window to catch late hits
    const isVisible = t >= spawnTime && timeToHit > -FIGHT_CONFIG.missWindow;

    if (isVisible && !note.el) {
      createNoteElement(note);
    }

    if (note.el) {
      // If note is judged, immediately hide it (shouldn't happen, but safety check)
      if (note.judged) {
        note.el.style.opacity = '0';
        note.el.style.display = 'none';
        continue;
      }
      
      if (isVisible && !note.judged) {
        // Calculate progress: 0 = at spawn, 1 = note center at receptor center
        // When timeToHit = 0 (note.time = t), progress = 1, note center aligns with receptor center
        // When timeToHit = approachTime, progress = 0, note is at spawn
        const noteCenterY = computeNoteCenterY(note, t);
        
        // Convert note center Y to note top Y for positioning
        const noteTopY = noteCenterY - noteCenterOffset;
        
        // Use transform for better performance (GPU accelerated)
        // translateX(-50%) centers horizontally, translateY positions note top
        note.el.style.transform = `translate3d(-50%, ${noteTopY}px, 0)`;
        note.el.style.opacity = '1';
      } else {
        // Hide note if not visible
        note.el.style.opacity = '0';
      }
    }

    // Auto-miss if note has passed the hit window (with a small buffer)
    if (timeToHit < -FIGHT_CONFIG.missWindow && !note.judged) {
      registerMiss(note, false); // Auto-miss (not from input)
    }
  }

  consumeBufferedInputs(t);
}

// ===========================================
// HIT DETECTION
// ===========================================

// registerHit is now inlined in handleDDRKeyDown for immediate execution
// This function is kept for backwards compatibility but is no longer used
function registerHit(note, quality) {
  // This function is deprecated - hit registration is now done directly in handleDDRKeyDown
  // for immediate execution without function call overhead
}

function registerMiss(note, fromInput = false) {
  if (note.judged) return;
  note.judged = true;
  note.pendingRemoval = false;

  removeNoteElement(note);

  fight.combo = 0;
  fight.hitStreak = 0; // Reset hit streak on miss
  fight.comboMilestones.clear(); // Reset combo milestones on miss
  fight.misses += 1;
  flashReceptor(note.dir, 'miss');
  
  // Trigger miss punishment: screen flash + jumpscare
  triggerMissPunishment();
}

/**
 * Applies damage to the enemy and checks win condition
 * @param {number} amount - Damage amount to apply
 */
function applyEnemyDamage(amount) {
  if (!fight.active) return;
  
  fight.enemy.hp = Math.max(0, fight.enemy.hp - amount);
  updateEnemyHPBar();
  
  // Flash HP bar on damage
  if (enemyHPBar) {
    enemyHPBar.classList.add('enemy-hp-damaged');
    setTimeout(() => {
      if (enemyHPBar) {
        enemyHPBar.classList.remove('enemy-hp-damaged');
      }
    }, 150);
  }
  
  // Check win condition
  if (fight.enemy.hp <= 0) {
    endFightWin();
  }
}

/**
 * Updates the enemy health bar fill and color based on current HP
 */
function updateEnemyHPBar() {
  if (!enemyHPFill || !fight.enemy) return;
  
  const ratio = Math.max(0, Math.min(1, fight.enemy.hp / fight.enemy.maxHP));
  const percent = ratio * 100;
  
  // Update fill height
  enemyHPFill.style.height = `${percent}%`;
  
  // Update color based on health ratio (green -> yellow -> red)
  let color;
  if (ratio > 0.6) {
    // Green (60-100%)
    const greenRatio = (ratio - 0.6) / 0.4; // 0 to 1 within green range
    color = `rgb(${Math.floor(34 + greenRatio * 221)}, ${Math.floor(139 + greenRatio * 116)}, ${Math.floor(34)})`;
  } else if (ratio > 0.3) {
    // Yellow (30-60%)
    const yellowRatio = (ratio - 0.3) / 0.3; // 0 to 1 within yellow range
    color = `rgb(${Math.floor(255)}, ${Math.floor(140 + yellowRatio * 115)}, ${Math.floor(0)})`;
  } else {
    // Red (0-30%)
    const redRatio = ratio / 0.3; // 0 to 1 within red range
    color = `rgb(${Math.floor(139 + redRatio * 116)}, ${Math.floor(0)}, ${Math.floor(0)})`;
  }
  
  enemyHPFill.style.background = `linear-gradient(180deg, ${color} 0%, ${color}dd 100%)`;
}

/**
 * Positions the enemy health bar between the enemy character and DDR track
 */
function positionEnemyHPBar() {
  if (!enemyHPBar) return;
  
  // If NPC overlay is not visible, use fallback positioning
  if (!npcOverlay || npcOverlay.style.display === 'none') {
    // Fallback: position relative to where enemy would be (left: 50px, width: 384px)
    const enemyRight = 50 + 384; // left + width
    const hpBarWidth = 50;
    
    // Get actual DDR track position from the lanes container
    let trackStartX = 700; // Fallback value
    if (fightLaneContainer) {
      const trackRect = fightLaneContainer.getBoundingClientRect();
      trackStartX = trackRect.left; // Actual left edge of the track
    }
    
    const paddingFromTrack = 20; // 20px padding between HP bar and track
    const maxX = trackStartX - hpBarWidth - paddingFromTrack; // Position with 20px padding
    
    // Position as far right as possible (closest to track with 20px padding)
    let hpBarX = maxX;
    hpBarX = Math.max(hpBarX, enemyRight + 10); // At least 10px from enemy
    
    enemyHPBar.style.left = `${hpBarX}px`;
    enemyHPBar.style.top = '50%';
    enemyHPBar.style.transform = 'translateY(-50%)';
    return;
  }
  
  // Get enemy character position
  const npcRect = npcOverlay.getBoundingClientRect();
  const enemyRight = npcRect.right; // Right edge of enemy character
  
  // Get actual DDR track position from the lanes container
  let trackStartX = 700; // Fallback value
  if (fightLaneContainer) {
    const trackRect = fightLaneContainer.getBoundingClientRect();
    trackStartX = trackRect.left; // Actual left edge of the track
  }
  
  // Position HP bar with 20px padding from track
  const hpBarWidth = 50; // Approximate width of HP bar
  const paddingFromTrack = 20; // 20px padding between HP bar and track
  const maxX = trackStartX - hpBarWidth - paddingFromTrack; // Position with 20px padding
  
  // Position as far right as possible (closest to track with 20px padding)
  let hpBarX = maxX;
  hpBarX = Math.max(hpBarX, enemyRight + 10); // At least 10px from enemy
  
  // Center vertically with enemy (same as enemy's vertical center)
  const enemyCenterY = npcRect.top + npcRect.height / 2;
  
  enemyHPBar.style.left = `${hpBarX}px`;
  enemyHPBar.style.top = `${enemyCenterY}px`;
  enemyHPBar.style.transform = 'translateY(-50%)';
}

/**
 * Shows the fight title animation (Mortal Kombat style)
 */
function showFightTitle() {
  if (!fightTitle) return;
  
  // Reset and show
  fightTitle.style.display = 'block';
  fightTitle.classList.remove('fight-title-active');
  
  // Force reflow
  void fightTitle.offsetWidth;
  
  // Trigger animation
  fightTitle.classList.add('fight-title-active');
  
  // Hide after animation completes (around 1.5-2 seconds)
  setTimeout(() => {
    if (fightTitle) {
      fightTitle.classList.remove('fight-title-active');
      setTimeout(() => {
        if (fightTitle) {
          fightTitle.style.display = 'none';
        }
      }, 500); // Fade out duration
    }
  }, 2000);
}

/**
 * Ends the fight with a WIN result
 */
function endFightWin() {
  if (!fight.active) return;
  
  // End fight with win result
  endFight('win');
}

/**
 * Gets the opponent's screen position anchor point for blood spray
 * @returns {Object|null} { x, y } screen coordinates or null if not available
 */
function getOpponentScreenAnchor() {
  // Use the NPC overlay (character PNG) position
  if (npcOverlay && npcOverlay.style.display !== 'none') {
    const npcRect = npcOverlay.getBoundingClientRect();
    // Anchor at upper torso (slightly above center)
    return {
      x: npcRect.left + npcRect.width / 2,
      y: npcRect.top + npcRect.height * 0.4 // 40% from top (upper torso area)
    };
  }
  
  // Fallback: if opponent is a Three.js model (not currently used, but future-proof)
  if (opponentNPC && opponentNPC.getSprite && camera) {
    const sprite = opponentNPC.getSprite();
    if (sprite) {
      const worldPos = sprite.position.clone();
      // Add chest offset (slightly up from center)
      worldPos.y += 0.5;
      const screenPos = worldToScreen(worldPos, camera);
      if (screenPos) {
        return screenPos;
      }
    }
  }
  
  // Final fallback: center-left of screen
  return {
    x: 50 + 192, // Left side character area
    y: window.innerHeight * 0.4
  };
}

/**
 * Spawns a blood spray effect from the opponent's position
 * Y2K Flash-style arcade blood spray (not gory)
 */
function spawnBloodSpray() {
  if (!fight.active || !bloodSprayContainer) return;
  
  // Get opponent screen anchor
  const anchor = getOpponentScreenAnchor();
  if (!anchor) return;
  
  // Cleanup old particles if we're at the limit
  if (activeBloodParticles.length >= MAX_BLOOD_PARTICLES) {
    const toRemove = activeBloodParticles.splice(0, activeBloodParticles.length - MAX_BLOOD_PARTICLES + 12);
    toRemove.forEach(particle => {
      if (particle.el && particle.el.parentNode) {
        particle.el.parentNode.removeChild(particle.el);
      }
    });
  }
  
  // Spawn 12 particles for a good spray effect
  const particleCount = 12;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = createBloodParticle(anchor);
    if (particle) {
      activeBloodParticles.push(particle);
      bloodSprayContainer.appendChild(particle.el);
      animateBloodParticle(particle);
    }
  }
}

/**
 * Creates a single blood spray particle
 * @param {Object} anchor - { x, y } screen coordinates
 * @returns {Object} Particle object with el and animation data
 */
function createBloodParticle(anchor) {
  const particle = document.createElement('div');
  particle.className = 'blood-spray-particle';
  
  // Random size (3-8px)
  const size = THREE.MathUtils.randFloat(3, 8);
  const isStreak = Math.random() > 0.5; // 50% chance of streak vs dot
  
  // Random red color variation (Y2K Flash style)
  const redShade = THREE.MathUtils.randFloat(0.7, 1.0);
  const red = Math.floor(redShade * 255);
  const color = `rgb(${red}, 0, 0)`;
  
  // Random starting position (small offset from anchor)
  const offsetX = THREE.MathUtils.randFloat(-10, 10);
  const offsetY = THREE.MathUtils.randFloat(-10, 10);
  
  // Random velocity (biased outward and slightly upward)
  const angle = THREE.MathUtils.randFloat(-Math.PI * 0.75, -Math.PI * 0.25); // Upward arc
  const speed = THREE.MathUtils.randFloat(80, 180);
  const velocityX = Math.cos(angle) * speed;
  const velocityY = Math.sin(angle) * speed;
  
  // Random rotation
  const rotation = THREE.MathUtils.randFloat(0, Math.PI * 2);
  
  // Random duration (200-450ms)
  const duration = THREE.MathUtils.randFloat(200, 450);
  
  // Set initial styles
  Object.assign(particle.style, {
    position: 'fixed',
    left: `${anchor.x + offsetX}px`,
    top: `${anchor.y + offsetY}px`,
    width: isStreak ? `${size * 2}px` : `${size}px`,
    height: isStreak ? `${size}px` : `${size}px`,
    backgroundColor: color,
    borderRadius: isStreak ? '0' : '50%',
    pointerEvents: 'none',
    zIndex: '10007',
    opacity: '1',
    transform: `translate(-50%, -50%) rotate(${rotation}rad)`,
    boxShadow: `0 0 ${size * 0.5}px ${color}`,
    willChange: 'transform, opacity'
  });
  
  return {
    el: particle,
    startX: anchor.x + offsetX,
    startY: anchor.y + offsetY,
    velocityX,
    velocityY,
    duration,
    startTime: performance.now()
  };
}

/**
 * Animates a blood spray particle
 * @param {Object} particle - Particle object from createBloodParticle
 */
function animateBloodParticle(particle) {
  function animate() {
    const elapsed = performance.now() - particle.startTime;
    const progress = elapsed / particle.duration;
    
    if (progress >= 1 || !particle.el || !particle.el.parentNode) {
      // Animation complete - remove particle
      if (particle.el && particle.el.parentNode) {
        particle.el.parentNode.removeChild(particle.el);
      }
      const index = activeBloodParticles.indexOf(particle);
      if (index > -1) {
        activeBloodParticles.splice(index, 1);
      }
      return;
    }
    
    // Calculate position with velocity and slight gravity
    const gravity = 50; // Downward acceleration
    const currentX = particle.startX + (particle.velocityX * progress);
    const currentY = particle.startY + (particle.velocityY * progress) + (gravity * progress * progress);
    
    // Fade out
    const opacity = 1 - progress;
    
    // Update particle
    particle.el.style.left = `${currentX}px`;
    particle.el.style.top = `${currentY}px`;
    particle.el.style.opacity = String(opacity);
    
    requestAnimationFrame(animate);
  }
  
  requestAnimationFrame(animate);
}

/**
 * Plays hurt sound effect when player gets punched
 */
function playHurtSound() {
  // Create new instance for each hit to allow stacking
  const hurtAudio = new Audio('/hurtsound.mp3');
  hurtAudio.volume = 1.0;
  hurtAudio.play().catch(err => {
    // Ignore errors silently
  });
  
  // Clean up after sound finishes
  hurtAudio.addEventListener('ended', () => {
    hurtAudio.remove();
  });
}

/**
 * Triggers miss punishment: red screen flash + jumpscare fist + hurt sound
 */
function triggerMissPunishment() {
  if (!fight.active) return;
  
  // Play hurt sound
  playHurtSound();
  
  // Red screen flash
  if (missFlashOverlay) {
    missFlashOverlay.classList.remove('miss-flash-active');
    void missFlashOverlay.offsetWidth; // Force reflow
    missFlashOverlay.classList.add('miss-flash-active');
    
    // Remove class after animation
    setTimeout(() => {
      if (missFlashOverlay) {
        missFlashOverlay.classList.remove('miss-flash-active');
      }
    }, 300);
  }
  
  // Jumpscare fist
  if (jumpscareFist) {
    jumpscareFist.classList.remove('jumpscare-active');
    void jumpscareFist.offsetWidth; // Force reflow
    jumpscareFist.classList.add('jumpscare-active');
    
    // Remove class after animation
    setTimeout(() => {
      if (jumpscareFist) {
        jumpscareFist.classList.remove('jumpscare-active');
      }
    }, 400);
  }
}

function flashReceptor(dir, quality) {
  const laneEntry = laneElements.get(dir);
  if (!laneEntry) return;

  const receptor = laneEntry.receptor;
  // Immediately apply feedback class for instant visual response
  receptor.classList.remove('receptor-hit', 'receptor-miss');
  void receptor.offsetWidth; // Force reflow to ensure class change is visible
  receptor.classList.add(quality === 'miss' ? 'receptor-miss' : 'receptor-hit');

  // Remove feedback after animation completes
  setTimeout(() => {
    if (receptor) {
      receptor.classList.remove('receptor-hit', 'receptor-miss');
    }
  }, 200);
}

// ===========================================
// PUNCH FEEDBACK SYSTEM
// ===========================================

// Track active punch pops (for cleanup)
const activePunchPops = [];
const MAX_CONCURRENT_POPS = 10;

// Player punch animation state
let playerPunchAnimationId = null;
let playerPunchStartTime = 0;
let ddrPunchHand = null; // Separate hand overlay for DDR fight

/**
 * Plays first-person player punch animation
 * NOTE: Player punch hand overlay removed per user request
 */
function playPlayerPunch() {
  // Player punch animation removed - only opponent reaction and fist pop remain
  // This keeps the feedback focused on the opponent being hit
}

/**
 * Plays opponent hit reaction animation
 */
function playOpponentHitReaction() {
  if (!opponentNPC || !opponentNPC.getSprite) return;
  
  const sprite = opponentNPC.getSprite();
  const originalPosition = sprite.position.clone();
  const originalRotation = sprite.rotation.clone();
  
  // Quick flinch: slight backward translate + slight rotation
  const flinchDistance = 0.15;
  const flinchAngle = 0.1;
  const flinchDuration = 150; // 150ms
  
  const startTime = performance.now();
  
  function animateReaction() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / flinchDuration, 1);
    
    if (progress >= 1) {
      // Restore original position
      sprite.position.copy(originalPosition);
      sprite.rotation.copy(originalRotation);
      return;
    }
    
    // Ease out animation
    const easeOut = 1 - Math.pow(1 - progress, 2);
    
    // Backward translate
    const backward = -flinchDistance * easeOut;
    sprite.position.x = originalPosition.x + backward;
    
    // Slight rotation
    sprite.rotation.y = originalRotation.y + (flinchAngle * easeOut);
    
    requestAnimationFrame(animateReaction);
  }
  
  requestAnimationFrame(animateReaction);
}

/**
 * Projects 3D world position to 2D screen coordinates
 */
function worldToScreen(worldPos, camera) {
  if (!camera) return null;
  
  const vector = worldPos.clone();
  vector.project(camera);
  
  const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
  
  return { x, y };
}

/**
 * Triggers character hit reaction animation
 */
function triggerCharacterHitReaction() {
  if (!npcOverlay) return;
  
  // Remove any existing hit animation class
  npcOverlay.classList.remove('character-hit-reaction');
  
  // Force reflow to ensure class removal is visible
  void npcOverlay.offsetWidth;
  
  // Add hit reaction class to trigger animation
  npcOverlay.classList.add('character-hit-reaction');
  
  // Remove class after animation completes
  setTimeout(() => {
    if (npcOverlay) {
      npcOverlay.classList.remove('character-hit-reaction');
    }
  }, 200); // Match animation duration
}

/**
 * Spawns a fist PNG pop overlay at the same position as the character PNG
 */
function spawnFistPop() {
  if (!hitPopLayer || !npcOverlay) {
    // Fallback: spawn at center-left of screen (same as npcOverlay default position)
    const fallbackX = 50 + 192; // left: 50px + half width (384px / 2)
    const fallbackY = window.innerHeight * 0.5;
    createFistPopElement(fallbackX, fallbackY);
    return;
  }
  
  // Trigger character hit reaction
  triggerCharacterHitReaction();
  
  // Get the npcOverlay position (same as character PNG)
  const npcRect = npcOverlay.getBoundingClientRect();
  const npcCenterX = npcRect.left + npcRect.width / 2;
  const npcCenterY = npcRect.top + npcRect.height / 2;
  
  // Random offset around the character PNG center
  const randomX = npcCenterX + THREE.MathUtils.randFloat(-80, 80);
  const randomY = npcCenterY + THREE.MathUtils.randFloat(-100, 100);
  
  createFistPopElement(randomX, randomY);
}

/**
 * Creates and animates a fist pop element
 */
function createFistPopElement(x, y) {
  // Cleanup old pops if at limit
  if (activePunchPops.length >= MAX_CONCURRENT_POPS) {
    const oldest = activePunchPops.shift();
    if (oldest && oldest.parentNode) {
      oldest.parentNode.removeChild(oldest);
    }
  }
  
  const fistImg = document.createElement('img');
  fistImg.src = '/punch.png';
  fistImg.className = 'fist-pop';
  fistImg.draggable = false;
  
  // Random scale and rotation
  const scale = THREE.MathUtils.randFloat(0.8, 1.15);
  const rotation = THREE.MathUtils.randFloat(-20, 20);
  const driftX = THREE.MathUtils.randFloat(-30, 30);
  const driftY = THREE.MathUtils.randFloat(-20, 20);
  
  // Initial state
  fistImg.style.position = 'fixed';
  fistImg.style.left = `${x}px`;
  fistImg.style.top = `${y}px`;
  fistImg.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(0.6)`;
  fistImg.style.opacity = '0';
  fistImg.style.pointerEvents = 'none';
  fistImg.style.zIndex = '10003';
  fistImg.style.width = '120px';
  fistImg.style.height = 'auto';
  fistImg.style.filter = 'drop-shadow(4px 8px 12px rgba(0, 0, 0, 0.6))';
  
  hitPopLayer.appendChild(fistImg);
  activePunchPops.push(fistImg);
  
  // Animation
  const duration = THREE.MathUtils.randFloat(250, 450);
  const startTime = performance.now();
  
  function animatePop() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    if (progress >= 1) {
      // Remove element
      if (fistImg.parentNode) {
        fistImg.parentNode.removeChild(fistImg);
      }
      const index = activePunchPops.indexOf(fistImg);
      if (index > -1) {
        activePunchPops.splice(index, 1);
      }
      return;
    }
    
    // Scale up quickly, then fade out with drift
    if (progress < 0.3) {
      // Scale in phase
      const scaleProgress = progress / 0.3;
      const currentScale = 0.6 + (scale * 0.4 * scaleProgress);
      const easeOut = 1 - Math.pow(1 - scaleProgress, 3);
      const currentRotation = rotation * (1 - easeOut * 0.5);
      fistImg.style.transform = `translate(-50%, -50%) rotate(${currentRotation}deg) scale(${currentScale})`;
      fistImg.style.opacity = String(easeOut);
    } else {
      // Fade out and drift phase
      const fadeProgress = (progress - 0.3) / 0.7;
      const driftProgress = fadeProgress;
      const currentX = x + (driftX * driftProgress);
      const currentY = y + (driftY * driftProgress);
      fistImg.style.left = `${currentX}px`;
      fistImg.style.top = `${currentY}px`;
      fistImg.style.opacity = String(1 - fadeProgress);
    }
    
    requestAnimationFrame(animatePop);
  }
  
  requestAnimationFrame(animatePop);
}

/**
 * Plays punch sound effect (creates new instance for each hit to allow stacking)
 * Randomly selects between punch.mp3 and punch2.mp3
 */
function playPunchSound() {
  // Randomly pick between two punch sounds
  const punchSounds = ['/punch.mp3', '/punch2.mp3'];
  const randomSound = punchSounds[Math.floor(Math.random() * punchSounds.length)];
  
  // Create a new Audio instance for each hit to allow overlapping sounds
  const punchSound = new Audio(randomSound);
  punchSound.volume = 1.0;
  punchSound.play().catch(err => {
    // Ignore errors silently
  });
  
  // Clean up after sound finishes (optional, prevents memory buildup)
  punchSound.addEventListener('ended', () => {
    punchSound.remove();
  });
}

/**
 * Shows combo milestone notification next to character
 */
function showComboNotification(milestone) {
  if (!comboNotification || !fightLaneContainer) return;
  
  // Map milestone to image file
  const comboImages = {
    5: '/5x.png',
    10: '/10x.png',
    15: '/15x.png'
  };
  
  const imageFile = comboImages[milestone];
  if (!imageFile) return;
  
  // Set image source
  comboNotification.src = imageFile;
  
  // Position in center of DDR tracks
  if (fightLaneContainer) {
    const laneRect = fightLaneContainer.getBoundingClientRect();
    const notificationX = laneRect.left + (laneRect.width / 2); // Center of tracks
    const notificationY = laneRect.top + (laneRect.height / 2) + 150; // Vertical center of tracks, moved up 130px (30px + 100px)
    
    comboNotification.style.left = `${notificationX}px`;
    comboNotification.style.top = `${notificationY}px`;
    comboNotification.style.display = 'block';
    comboNotification.style.opacity = '1';
    comboNotification.style.transform = 'translate(-50%, -50%) scale(0)';
    
    // Force reflow
    void comboNotification.offsetWidth;
    
    // Stamp animation: small to big
    requestAnimationFrame(() => {
      comboNotification.style.transform = 'translate(-50%, -50%) scale(1)';
    });
    
    // Hide after 1 second with scale down
    setTimeout(() => {
      if (comboNotification) {
        comboNotification.style.transform = 'translate(-50%, -50%) scale(0)';
        setTimeout(() => {
          if (comboNotification) {
            comboNotification.style.display = 'none';
          }
        }, 200); // Match scale-down animation
      }
    }, 1000);
  }
}

/**
 * Plays combo milestone sound effects
 * Plays combo1.mp3 at 5 hits, combo2.mp3 at 10 hits, combo3.mp3 at 15 hits
 */
function playComboSound(comboCount) {
  let comboSoundFile = null;
  let milestone = null;
  
  if (comboCount === 5) {
    comboSoundFile = '/combo1.mp3';
    milestone = 5;
  } else if (comboCount === 10) {
    comboSoundFile = '/combo2.mp3';
    milestone = 10;
  } else if (comboCount === 15) {
    comboSoundFile = '/combo3.mp3';
    milestone = 15;
  }
  
  // Only play if we haven't reached this milestone before
  if (comboSoundFile && milestone && !fight.comboMilestones.has(milestone)) {
    fight.comboMilestones.add(milestone);
    
    // Show combo notification
    showComboNotification(milestone);
    
    const comboAudio = new Audio(comboSoundFile);
    comboAudio.volume = 1.0;
    comboAudio.play().catch(err => {
      // Ignore errors silently
    });
    
    // Clean up after sound finishes
    comboAudio.addEventListener('ended', () => {
      comboAudio.remove();
    });
  }
}

/**
 * Main function to trigger all punch feedback
 */
function triggerPunchFeedback(quality) {
  if (!fight.active) return;
  
  // A) Play player punch animation
  playPlayerPunch();
  
  // B) Spawn fist PNG pop overlay
  spawnFistPop();
  
  // C) Play opponent hit reaction
  playOpponentHitReaction();
}

function showJudgementText(text, type, options = {}) {
  // Create or reuse judgement text element
  let judgementEl = document.getElementById('ddr-judgement-text');
  if (!judgementEl) {
    judgementEl = document.createElement('div');
    judgementEl.id = 'ddr-judgement-text';
    judgementEl.className = 'ddr-judgement-text';
    if (fightUI) {
      fightUI.appendChild(judgementEl);
    } else {
      document.body.appendChild(judgementEl);
    }
  }

  // Set text and type
  judgementEl.textContent = text;
  judgementEl.className = `ddr-judgement-text ddr-judgement-${type}`;
  judgementEl.classList.toggle('ddr-judgement-buffered', Boolean(options.buffered));
  judgementEl.style.display = 'block';
  judgementEl.style.opacity = '1';

  // Animate in
  requestAnimationFrame(() => {
    judgementEl.classList.add('judgement-show');
  });

  // Hide after animation
  setTimeout(() => {
    judgementEl.classList.remove('judgement-show');
    setTimeout(() => {
      judgementEl.style.display = 'none';
    }, 300);
  }, 800);
}

function attemptHit(dir, t, fromBuffer = false) {
  const candidate = findNearestNote(dir, t);
  if (!candidate) return false;

  const withinWindow = candidate.absTime <= FIGHT_CONFIG.hitWindowGood
    || candidate.absDist <= FIGHT_CONFIG.distanceWindowPx;
  if (!withinWindow) return false;

  const lastHit = fight.lastHitTime[dir] || 0;
  if (t - lastHit < 0.06) return false;

  const note = candidate.note;
  note.judged = true;
  note.hit = true;
  note.pendingRemoval = true;
  fight.lastHitTime[dir] = t;

  const quality = candidate.absTime <= FIGHT_CONFIG.hitWindowPerfect ? 'nice' : 'ok';

  if (note.el) {
    snapNoteToReceptor(note);
  } else {
    removeNoteElement(note);
  }

  if (quality === 'nice') {
    fight.score += FIGHT_CONFIG.scorePerfect;
  } else {
    fight.score += FIGHT_CONFIG.scoreGood;
  }
  fight.combo += 1;
  fight.hits += 1;
  fight.hitStreak += 1; // Increment hit streak for blood spray

  flashReceptor(dir, 'hit');
  
  // Play punch sound effect
  playPunchSound();
  
  // Check and play combo milestone sounds
  playComboSound(fight.combo);
  
  // Trigger punch feedback on successful hit
  triggerPunchFeedback(quality);
  
  // Trigger blood spray on every hit
  spawnBloodSpray();
  
  // Apply damage to enemy based on hit quality
  const damage = quality === 'nice' ? 10 : 6; // Perfect = 10, Good = 6
  applyEnemyDamage(damage);
  
  return true;
}

function consumeBufferedInputs(t) {
  const bufferWindow = FIGHT_CONFIG.bufferMs / 1000;
  for (const dir of ARROW_DIRS) {
    const bufferedAt = fight.inputBuffer[dir];
    if (!bufferedAt) continue;
    if (t - bufferedAt > bufferWindow) {
      delete fight.inputBuffer[dir];
      continue;
    }
    if (attemptHit(dir, t, true)) {
      delete fight.inputBuffer[dir];
    }
  }
}


// ===========================================
// INPUT HANDLING
// ===========================================

function handleDDRKeyDown(event) {
  if (!fight.active) return;
  if (event.repeat) return;

  // Prevent input leakage
  event.stopPropagation();
  event.preventDefault();

  let dir = null;
  switch (event.code) {
    case 'ArrowLeft':
    case 'KeyA':
      dir = 'L';
      break;
    case 'ArrowUp':
    case 'KeyW':
      dir = 'U';
      break;
    case 'ArrowDown':
    case 'KeyS':
      dir = 'D';
      break;
    case 'ArrowRight':
    case 'KeyD':
      dir = 'R';
      break;
    default:
      return;
  }

  // TIME-BASED HIT DETECTION
  // Use performance.now() for accurate timing (not accumulated deltaTime)
  const t = nowSec();
  if (attemptHit(dir, t, false)) {
    return;
  }

  fight.inputBuffer[dir] = t;
}

// ===========================================
// FIGHT LIFECYCLE
// ===========================================

function triggerAngerFight() {
  if (anger.isFightActive || fight.active) return;
  if (anger.value < 1.0) return;

  anger.isFightActive = true;
  fight.active = true;

  // Lock movement and camera
  if (typeof setMovementLocked === 'function') {
    setMovementLocked(true);
  }
  if (typeof setCameraLocked === 'function') {
    setCameraLocked(true);
  }

  // Pick and position opponent
  opponentNPC = pickOpponent();
  if (opponentNPC) {
    opponentStartPosition = opponentNPC.position.clone();
    opponentStartRotation = opponentNPC.getSprite().rotation.y;
  }

  // Initialize fight state with performance.now() for accurate timing
  fight.startPerf = performance.now();
  fight.score = 0;
  fight.combo = 0;
  fight.hits = 0;
  fight.misses = 0;
  fight.hitStreak = 0; // Reset hit streak when fight starts
  fight.enemy.hp = fight.enemy.maxHP; // Reset enemy HP to max
  fight.notes = buildNotesPattern();
  fight.lastHitTime = {};
  fight.inputBuffer = {};
  fight.receptorCenterY = FIGHT_CONFIG.receptorCenterY;
  fight.comboMilestones.clear(); // Reset combo milestones when fight starts
  
  // Initialize and position enemy HP bar
  if (enemyHPBar) {
    enemyHPBar.style.display = 'block';
    updateEnemyHPBar();
    // Position after NPC overlay is set up (multiple frames to ensure rendering)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        positionEnemyHPBar();
      });
    });
  }

  // Play fight audio and show fight title animation
  if (!fightAudio) {
    fightAudio = new Audio('/fight.mp3');
    fightAudio.preload = 'auto';
  }
  fightAudio.currentTime = 0;
  fightAudio.volume = 1.0;
  fightAudio.play().catch(err => {
    console.warn('Failed to play fight audio:', err);
  });
  
  // Show fight title animation (Mortal Kombat style)
  showFightTitle();


  // Get and display last pushed NPC on left side
  const lastPushed = getLastPushedNPC();
  if (lastPushed && npcOverlay) {
    // Try to get texture path first (if stored)
    if (lastPushed.texturePath) {
      npcOverlay.style.backgroundImage = `url(${lastPushed.texturePath})`;
      npcOverlay.style.display = 'block';
    } else {
      // Fallback: Get texture from NPC sprite
      const sprite = lastPushed.getSprite();
      if (sprite && sprite.material && sprite.material.map) {
        const texture = sprite.material.map;
        // Get image source from texture
        if (texture.image) {
          if (texture.image.src) {
            npcOverlay.style.backgroundImage = `url(${texture.image.src})`;
            npcOverlay.style.display = 'block';
          } else if (texture.image instanceof HTMLCanvasElement) {
            // Canvas-based texture
            npcOverlay.style.backgroundImage = `url(${texture.image.toDataURL()})`;
            npcOverlay.style.display = 'block';
          }
        }
      }
    }
  } else if (npcOverlay) {
    npcOverlay.style.display = 'none';
  }

  // Hide ALL gameplay UI
  hideGameplayUI();

  // Create and show full-screen fight UI
  createFightUI();
  if (fightOverlay) {
    fightOverlay.classList.remove('hidden');
    // Fade-in transition
    requestAnimationFrame(() => {
      fightOverlay.classList.add('fade-in');
      cacheReceptorMetrics();
    });
  }

  fight.resizeHandler = () => {
    cacheReceptorMetrics();
    positionEnemyHPBar(); // Reposition HP bar on resize
  };
  window.addEventListener('resize', fight.resizeHandler);

  // Add input listener
  document.addEventListener('keydown', handleDDRKeyDown, true);
}

function endFight(result) {
  fight.active = false;
  anger.isFightActive = false;

  // Stop and reset fight audio
  if (fightAudio) {
    fightAudio.pause();
    fightAudio.currentTime = 0;
  }

  // Play win audio and confetti if:
  // 1. Player got more than 8 successful hits, OR
  // 2. Enemy HP reached 0 (win condition)
  const isWin = result === 'win' || fight.enemy.hp <= 0 || fight.hits > 8;
  
  if (isWin) {
    console.log('[WIN] triggered');
    const winAudio = new Audio('/yay.mp3');
    winAudio.volume = 1.0;
    winAudio.play().catch(err => {
      console.warn('Failed to play win audio:', err);
    });

    if (typeof onWinCallback === 'function') {
      onWinCallback();
    }
  }

  // Remove input listener
  document.removeEventListener('keydown', handleDDRKeyDown, true);
  if (fight.resizeHandler) {
    window.removeEventListener('resize', fight.resizeHandler);
    fight.resizeHandler = null;
  }

  // Cleanup punch feedback
  // Cleanup all active punch pops
  activePunchPops.forEach(pop => {
    if (pop && pop.parentNode) {
      pop.parentNode.removeChild(pop);
    }
  });
  activePunchPops.length = 0;

  // Cleanup miss punishment elements
  if (missFlashOverlay) {
    missFlashOverlay.classList.remove('miss-flash-active');
  }
  if (jumpscareFist) {
    jumpscareFist.classList.remove('jumpscare-active');
  }

  // Cleanup blood spray particles
  activeBloodParticles.forEach(particle => {
    if (particle.el && particle.el.parentNode) {
      particle.el.parentNode.removeChild(particle.el);
    }
  });
  activeBloodParticles.length = 0;

  // Hide enemy HP bar
  if (enemyHPBar) {
    enemyHPBar.style.display = 'none';
  }

  // Hide fight title
  if (fightTitle) {
    fightTitle.style.display = 'none';
    fightTitle.classList.remove('fight-title-active');
  }

  // Hide NPC overlay
  if (npcOverlay) {
    npcOverlay.style.display = 'none';
  }

  // Fade out fight UI
  if (fightOverlay) {
    fightOverlay.classList.remove('fade-in');
    fightOverlay.classList.add('fade-out');
    
    // Wait for fade-out animation, then hide and restore UI
    setTimeout(() => {
      if (fightOverlay) {
        fightOverlay.classList.add('hidden');
        fightOverlay.classList.remove('fade-out');
      }
      
      // Restore all gameplay UI
      showGameplayUI();
      
      // Clear notes
      fight.notes.forEach(note => {
        if (note.el && note.el.parentNode) {
          note.el.parentNode.removeChild(note.el);
        }
      });
      fight.notes = [];
    }, 300); // Match fade-out duration
  } else {
    // Fallback if overlay doesn't exist
    showGameplayUI();
    fight.notes.forEach(note => {
      if (note.el && note.el.parentNode) {
        note.el.parentNode.removeChild(note.el);
      }
    });
    fight.notes = [];
  }

  // Restore opponent
  if (opponentNPC && opponentStartPosition) {
    opponentNPC.position.copy(opponentStartPosition);
    if (opponentStartRotation !== null) {
      opponentNPC.getSprite().rotation.y = opponentStartRotation;
    }
  }
  opponentNPC = null;
  opponentStartPosition = null;
  opponentStartRotation = null;

  // Unlock movement and camera
  if (typeof setMovementLocked === 'function') {
    setMovementLocked(false);
  }
  if (typeof setCameraLocked === 'function') {
    setCameraLocked(false);
  }

  // Reset anger
  anger.value = 0;
  anger.comboCount = 0;
  anger.lastPushTime = 0;
  setAngerUI(anger.value);
}

// ===========================================
// PUBLIC API
// ===========================================

export function initAngerSystem(options = {}) {
  npcPool = Array.isArray(options.npcs) ? options.npcs : [];
  getPlayerPosition = options.getPlayerPosition || null;
  setMovementLocked = options.setMovementLocked || null;
  camera = options.camera || null;
  setCameraLocked = options.setCameraLocked || null;
  onWinCallback = options.onWin || null;

  createAngerUI();
  createFightUI();
  setAngerUI(anger.value);
}

export function updateAnger(deltaTime) {
  if (!angerUI) return;

  // Update fight if active
  if (anger.isFightActive && fight.active) {
    // Update opponent position
    updateOpponentPosition();

    // Update notes (uses performance.now() internally for accurate timing)
    updateNotes();

    // Check win/lose
    if (fight.score >= FIGHT_CONFIG.targetScore) {
      endFight('win');
      return;
    }

    // Check if all notes are judged or time expired
    const allJudged = fight.notes.every(note => note.judged);
    const beatInterval = 60 / fight.bpm;
    const lastNoteTime = fight.notes.length > 0 
      ? fight.notes[fight.notes.length - 1].time 
      : 0;
    const fightDuration = lastNoteTime + beatInterval * 2;
    const currentTime = nowSec();

    if (allJudged || currentTime >= fightDuration) {
      const accuracy = fight.hits / (fight.hits + fight.misses);
      endFight(accuracy >= 0.7 ? 'win' : 'lose');
      return;
    }

    return; // Don't update anger during fight
  }

  // Normal anger decay
  const now = performance.now();
  const comboActive = now - anger.lastPushTime <= anger.comboWindowMs;
  if (!comboActive) {
    anger.value = clamp01(anger.value - CONFIG.decayRate * deltaTime);
  }

  setAngerUI(anger.value);

  // Check for fight trigger
  if (anger.value >= 1.0 && !anger.isFightActive) {
    triggerAngerFight();
  }
}

export function onNPCHitPush(npcId) {
  // Don't accumulate anger during fight
  if (anger.isFightActive) return;

  const now = performance.now();
  const withinWindow = now - anger.lastPushTime <= anger.comboWindowMs;
  anger.comboCount = withinWindow ? anger.comboCount + 1 : 1;
  anger.lastPushTime = now;

  const increment = CONFIG.baseIncrement + CONFIG.comboBonus * (anger.comboCount - 1);
  anger.value = clamp01(anger.value + increment);

  popAngerFill();
  setAngerUI(anger.value);
}

export function isFightActive() {
  return anger.isFightActive;
}

export function canAddAngerFromPush() {
  return !anger.isFightActive;
}
