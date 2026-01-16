/**
 * HOTBAR UI MODULE
 * 
 * A fixed UI overlay at the bottom of the screen with 5 item slots.
 * Players can press keys 1-5 to select the corresponding slot.
 * 
 * Exports:
 *   - initHotbar()          : Initialize the hotbar DOM and state
 *   - setSelectedSlot(n)    : Set the selected slot (1-5)
 *   - getSelectedSlot()     : Get the currently selected slot index
 * 
 * FUTURE EXTENSIONS:
 *   - Add setSlotItem(slotIndex, itemType, iconPath) to populate slots
 *   - Add getSlotItem(slotIndex) to query slot contents
 *   - Add onSlotSelect callback for item usage logic
 */

import './hotbar.css';

// ===========================================
// STATE MANAGEMENT
// ===========================================

/**
 * Hotbar state object
 * - selectedSlot: Currently selected slot (0 = none, 1-5 = slot)
 * - slots: Array of slot data { type: string|null, icon: string|null }
 */
const hotbarState = {
  selectedSlot: 0, // Start with nothing selected
  slots: [
    // Slot 1: Camera item (pre-populated)
    { type: 'camera', icon: '/icon/camera.png' },
    // Slots 2-5: Empty (placeholder for future items)
    { type: null, icon: null },
    { type: null, icon: null },
    { type: null, icon: null },
    { type: null, icon: null },
  ]
};

// DOM element references (cached for performance)
let containerEl = null;
let slotElements = [];

// ===========================================
// DOM CREATION
// ===========================================

/**
 * Creates the hotbar DOM structure
 * Called once during initialization
 */
function createHotbarDOM() {
  // Create main container
  containerEl = document.createElement('div');
  containerEl.id = 'hotbar-container';
  
  // Create 5 slots
  for (let i = 0; i < 5; i++) {
    const slotIndex = i + 1; // 1-based index for display
    const slotData = hotbarState.slots[i];
    
    // Slot wrapper
    const slotEl = document.createElement('div');
    slotEl.className = 'hotbar-slot';
    slotEl.dataset.slot = slotIndex;
    
    // Mark empty slots
    if (!slotData.icon) {
      slotEl.classList.add('empty');
    }
    
    // Apply selected state to default slot
    if (slotIndex === hotbarState.selectedSlot) {
      slotEl.classList.add('selected');
    }
    
    // Slot number indicator
    const numberEl = document.createElement('span');
    numberEl.className = 'hotbar-slot-number';
    numberEl.textContent = slotIndex;
    slotEl.appendChild(numberEl);
    
    // Item icon (if slot has an item)
    if (slotData.icon) {
      const iconEl = document.createElement('img');
      iconEl.className = 'hotbar-slot-icon';
      iconEl.src = slotData.icon;
      iconEl.alt = slotData.type || 'item';
      iconEl.draggable = false;
      slotEl.appendChild(iconEl);
    }
    
    // Cache reference and add to container
    slotElements.push(slotEl);
    containerEl.appendChild(slotEl);
  }
  
  // Append to document body
  document.body.appendChild(containerEl);
}

// ===========================================
// UI UPDATE
// ===========================================

/**
 * Updates the visual highlight to reflect the current selected slot
 * Only modifies DOM classes, no re-creation
 */
function updateSelectionHighlight() {
  slotElements.forEach((slotEl, index) => {
    const slotIndex = index + 1;
    if (slotIndex === hotbarState.selectedSlot) {
      slotEl.classList.add('selected');
    } else {
      slotEl.classList.remove('selected');
    }
  });
}

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Initialize the hotbar system
 * Creates DOM elements and sets up initial state
 * Should be called once when the game starts
 */
export function initHotbar() {
  // Prevent double initialization
  if (containerEl) {
    console.warn('Hotbar already initialized');
    return;
  }
  
  createHotbarDOM();
  console.log('Hotbar initialized (no slot selected)');
}

/**
 * Set the selected slot (toggle behavior)
 * @param {number} slotIndex - Slot number (1-5)
 * @returns {boolean} true if slot is now selected, false if deselected
 */
export function setSelectedSlot(slotIndex) {
  // Validate input
  if (slotIndex < 1 || slotIndex > 5) {
    console.warn(`Invalid slot index: ${slotIndex}. Must be 1-5.`);
    return false;
  }
  
  // Toggle behavior: if same slot pressed, deselect it
  if (slotIndex === hotbarState.selectedSlot) {
    hotbarState.selectedSlot = 0;
    updateSelectionHighlight();
    console.log(`Hotbar: Deselected slot ${slotIndex}`);
    return false; // Slot is now deselected
  }
  
  // Select the new slot
  hotbarState.selectedSlot = slotIndex;
  
  // Update DOM (only highlight change, no recreation)
  updateSelectionHighlight();
  
  // Debug log (can be removed in production)
  const slotData = hotbarState.slots[slotIndex - 1];
  const itemName = slotData.type || 'empty';
  console.log(`Hotbar: Selected slot ${slotIndex} (${itemName})`);
  return true; // Slot is now selected
}

/**
 * Get the currently selected slot index
 * @returns {number} Current slot (0 = none, 1-5 = slot)
 */
export function getSelectedSlot() {
  return hotbarState.selectedSlot;
}

/**
 * Get the item data for a specific slot
 * @param {number} slotIndex - Slot number (1-5)
 * @returns {object|null} Slot data { type, icon } or null if invalid
 * 
 * FUTURE USE: Call this to check what item is in a slot
 * Example: const item = getSlotItem(getSelectedSlot());
 */
export function getSlotItem(slotIndex) {
  if (slotIndex < 1 || slotIndex > 5) {
    return null;
  }
  return { ...hotbarState.slots[slotIndex - 1] };
}

/**
 * Get the type of the currently selected item
 * @returns {string|null} Item type (e.g., 'camera', 'babyoil') or null if no item selected
 * 
 * This is a convenience function to quickly check what item is active.
 * Returns null if:
 *   - No slot is selected (selectedSlot === 0)
 *   - Selected slot is empty (type === null)
 */
export function getSelectedItemType() {
  if (hotbarState.selectedSlot === 0) {
    return null;
  }
  const slotData = hotbarState.slots[hotbarState.selectedSlot - 1];
  return slotData ? slotData.type : null;
}

/**
 * FUTURE: Set an item in a specific slot
 * @param {number} slotIndex - Slot number (1-5)
 * @param {string|null} itemType - Item type identifier (e.g., 'camera', 'flashlight')
 * @param {string|null} iconPath - Path to the item icon image
 * 
 * Example usage:
 *   setSlotItem(2, 'flashlight', '/assets/flashlight.png');
 *   setSlotItem(3, null, null); // Clear slot
 */
export function setSlotItem(slotIndex, itemType, iconPath) {
  if (slotIndex < 1 || slotIndex > 5) {
    console.warn(`Invalid slot index: ${slotIndex}. Must be 1-5.`);
    return;
  }
  
  const index = slotIndex - 1;
  hotbarState.slots[index] = { type: itemType, icon: iconPath };
  
  // Update the DOM for this slot
  const slotEl = slotElements[index];
  if (!slotEl) return;
  
  // Remove existing icon if any
  const existingIcon = slotEl.querySelector('.hotbar-slot-icon');
  if (existingIcon) {
    existingIcon.remove();
  }
  
  // Add new icon or mark as empty
  if (iconPath) {
    slotEl.classList.remove('empty');
    const iconEl = document.createElement('img');
    iconEl.className = 'hotbar-slot-icon';
    iconEl.src = iconPath;
    iconEl.alt = itemType || 'item';
    iconEl.draggable = false;
    slotEl.appendChild(iconEl);
  } else {
    slotEl.classList.add('empty');
  }
}
