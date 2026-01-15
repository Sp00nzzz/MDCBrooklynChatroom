/**
 * Chat UI - DOM creation and message display
 * 
 * This module handles the visual chat panel, message rendering, and animations.
 * Messages are displayed in a scrollable panel anchored to the bottom-left corner.
 */

const MAX_VISIBLE_MESSAGES = 7; // Maximum number of messages to show

class ChatUI {
  constructor() {
    this.messages = [];
    this.container = null;
    this.messageArea = null;
    this.messageCounter = 0; // Track message count for color alternation
    this.init();
  }

  /**
   * Initialize the chat UI by creating DOM elements
   */
  init() {
    // Create main window container
    this.container = document.createElement('div');
    this.container.id = 'chat-container';
    this.container.className = 'chat-container';
    
    // Create title bar
    const titleBar = document.createElement('div');
    titleBar.className = 'chat-title-bar';
    titleBar.textContent = 'fucking arkham asylum gc';
    this.container.appendChild(titleBar);
    
    // Create message log panel
    const messagePanel = document.createElement('div');
    messagePanel.className = 'chat-message-panel';
    
    // Create message area (scrollable)
    this.messageArea = document.createElement('div');
    this.messageArea.className = 'chat-messages';
    messagePanel.appendChild(this.messageArea);
    
    this.container.appendChild(messagePanel);
    
    // Create toolbar (decorative, non-functional)
    const toolbar = document.createElement('div');
    toolbar.className = 'chat-toolbar';
    toolbar.innerHTML = '<button class="toolbar-btn" title="Bold">B</button><button class="toolbar-btn" title="Italic">I</button><button class="toolbar-btn" title="Underline">U</button><button class="toolbar-btn" title="Smiley">☺</button>';
    this.container.appendChild(toolbar);
    
    // Create input area
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    
    const inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.className = 'chat-input';
    inputField.placeholder = 'You don\'t have permission to type in this chat...';
    inputField.disabled = true; // Keep non-interactive as per original
    inputArea.appendChild(inputField);
    
    this.container.appendChild(inputArea);
    
    // Append to body
    document.body.appendChild(this.container);
  }

  /**
   * Add a new message to the chat
   * @param {string} name - Character name
   * @param {string} text - Message text
   * @param {string} color - Character color
   */
  addMessage(name, text, color) {
    // Create message element (no animations for retro look)
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    
    // Create name span with alternating blue/red color
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = `${name}: `;
    // Alternate between blue and red for each message
    const isBlue = this.messageCounter % 2 === 0;
    nameSpan.style.color = isBlue ? '#0000ff' : '#ff0000';
    
    // Create text span
    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = text;
    
    // Assemble message
    messageEl.appendChild(nameSpan);
    messageEl.appendChild(textSpan);
    
    // Add to message area
    this.messageArea.appendChild(messageEl);
    this.messages.push(messageEl);
    
    // Increment counter for next message
    this.messageCounter++;
    
    // Enforce message limit (no fade animations)
    if (this.messages.length > MAX_VISIBLE_MESSAGES) {
      const oldestMessage = this.messages.shift();
      if (oldestMessage.parentNode) {
        oldestMessage.parentNode.removeChild(oldestMessage);
      }
    }
    
    // Auto-scroll to bottom
    this.scrollToBottom();
  }

  /**
   * Scroll message area to bottom to show latest message
   */
  scrollToBottom() {
    requestAnimationFrame(() => {
      this.messageArea.scrollTop = this.messageArea.scrollHeight;
    });
  }

  /**
   * Clean up the chat UI (if needed)
   */
  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

export default ChatUI;
