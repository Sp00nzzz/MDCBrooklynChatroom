/**
 * Settings UI - Top right settings panel with master volume control
 * Semi-transparent clickable text that expands to show volume slider
 */

// Master volume value (0.0 to 1.0)
let masterVolume = 1.0;

// Callbacks to notify audio sources of volume changes
const volumeChangeCallbacks = [];

// DOM elements
let settingsContainer = null;
let settingsButton = null;
let settingsPanel = null;
let volumeSlider = null;
let volumeLabel = null;
let isOpen = false;

/**
 * Initialize the settings UI
 * Creates the settings button and panel in the DOM
 */
export function initSettings() {
  // Create container
  settingsContainer = document.createElement('div');
  settingsContainer.id = 'settings-container';
  settingsContainer.innerHTML = `
    <div id="settings-button">Settings</div>
    <div id="settings-panel">
      <div class="settings-header">Settings</div>
      <div class="settings-row">
        <label for="volume-slider">Master Volume</label>
        <input type="range" id="volume-slider" min="0" max="100" value="100">
        <span id="volume-label">100%</span>
      </div>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #settings-container {
      position: fixed;
      top: 15px;
      right: 15px;
      z-index: 1000;
      font-family: 'Arial', sans-serif;
    }
    
    #settings-button {
      background: transparent;
      color: rgba(255, 255, 255, 0.7);
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
      user-select: none;
    }
    
    #settings-button:hover {
      background: transparent;
      color: rgba(255, 255, 255, 0.9);
    }
    
    #settings-panel {
      display: none;
      background: rgba(0, 0, 0, 0.75);
      border-radius: 8px;
      padding: 15px;
      margin-top: 8px;
      min-width: 220px;
      backdrop-filter: blur(10px);
    }
    
    #settings-panel.open {
      display: block;
    }
    
    .settings-header {
      color: #fff;
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .settings-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .settings-row label {
      color: rgba(255, 255, 255, 0.8);
      font-size: 13px;
    }
    
    .settings-row input[type="range"] {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.2);
      outline: none;
      -webkit-appearance: none;
      appearance: none;
      cursor: pointer;
    }
    
    .settings-row input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    .settings-row input[type="range"]::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      border: none;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    #volume-label {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12px;
      text-align: right;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(settingsContainer);
  
  // Get references to elements
  settingsButton = document.getElementById('settings-button');
  settingsPanel = document.getElementById('settings-panel');
  volumeSlider = document.getElementById('volume-slider');
  volumeLabel = document.getElementById('volume-label');
  
  // Event listeners
  settingsButton.addEventListener('click', togglePanel);
  
  volumeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    setMasterVolume(value / 100);
  });
  
  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (isOpen && !settingsContainer.contains(e.target)) {
      closePanel();
    }
  });
  
  // Prevent pointer lock when interacting with settings
  settingsContainer.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
}

/**
 * Toggle the settings panel open/closed
 */
function togglePanel() {
  if (isOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

/**
 * Open the settings panel
 */
function openPanel() {
  isOpen = true;
  settingsPanel.classList.add('open');
}

/**
 * Close the settings panel
 */
function closePanel() {
  isOpen = false;
  settingsPanel.classList.remove('open');
}

/**
 * Set the master volume (0.0 to 1.0)
 * @param {number} volume - Volume value between 0 and 1
 */
export function setMasterVolume(volume) {
  masterVolume = Math.max(0, Math.min(1, volume));
  
  // Update UI
  if (volumeSlider) {
    volumeSlider.value = Math.round(masterVolume * 100);
  }
  if (volumeLabel) {
    volumeLabel.textContent = `${Math.round(masterVolume * 100)}%`;
  }
  
  // Notify all registered callbacks
  volumeChangeCallbacks.forEach(callback => callback(masterVolume));
}

/**
 * Get the current master volume (0.0 to 1.0)
 * @returns {number} Current master volume
 */
export function getMasterVolume() {
  return masterVolume;
}

/**
 * Register a callback to be notified when volume changes
 * @param {Function} callback - Function to call with new volume value
 */
export function onVolumeChange(callback) {
  if (typeof callback === 'function') {
    volumeChangeCallbacks.push(callback);
  }
}

/**
 * Show the settings UI (called after game starts)
 */
export function showSettings() {
  if (settingsContainer) {
    settingsContainer.style.display = 'block';
  }
}

/**
 * Hide the settings UI (e.g., on start screen)
 */
export function hideSettings() {
  if (settingsContainer) {
    settingsContainer.style.display = 'none';
  }
}
