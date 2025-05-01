// content.js - Runs in the context of VK pages to monitor and respond to messages

let config = {
  targetUsers: [],
  targetWords: [],
  groupResponse: "",
  privateResponse: "",
  isMonitoring: false,
  playSoundOnDetection: true
};

let processedMessages = new Set();
let observingChat = false;
let chatObserver = null;
let lastChatId = null;
let currentUserId = null;

// Create audio element for notification sound
const notificationSound = new Audio(
  "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBkSg4fnJeSwFJHfH8N2QQAoUXrTq6KRYFApGn+D1yHhH+"
);

// Initialize when the page loads
(function init() {
  console.log("VK Monitor: Extension initialized");
  
  // Get configuration from background
  browser.runtime.sendMessage({ action: "getConfig" })
    .then(response => {
      if (response && response.config) {
        config = response.config;
        console.log("VK Monitor: Configuration loaded", config);
        
        // Start monitoring if enabled
        if (config.isMonitoring) {
          startChatMonitoring();
        }
      }
    })
    .catch(error => console.error("Error getting configuration:", error));
    
  // Extract current user ID
  getCurrentUserId();

  // Add a periodic check for VK chat elements
  // This helps when navigating between pages
  setInterval(checkForVkChat, 2000);
})();

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "configUpdated") {
    config = message.config;
    console.log("VK Monitor: Configuration updated", config);
    sendResponse({ success: true });
  }
  else if (message.action === "monitoringToggled") {
    config.isMonitoring = message.isMonitoring;
    
    if (config.isMonitoring) {
      startChatMonitoring();
    } else {
      stopChatMonitoring();
    }
    
    console.log("VK Monitor: Monitoring " + (config.isMonitoring ? "started" : "stopped"));
    sendResponse({ success: true });
  }
  
  return true;
});

// Check if the VK chat is present on the current page
function checkForVkChat() {
  if (!config.isMonitoring) return;
  
  const chatContainer = document.querySelector('.im-page--chat-body');
  if (chatContainer && !observingChat) {
    console.log("VK Monitor: VK chat detected, starting monitoring");
    startChatMonitoring();
  }
}

// Start monitoring chat messages
function startChatMonitoring() {
  if (observingChat) return;
  
  // Setup MutationObserver for message content
  setupChatObserver();
  
  // Check URL changes to detect when user navigates to different chats
  setupUrlChangeDetection();
  
  observingChat = true;
  
  // Do an initial message check
  setTimeout(checkForNewMessages, 1000);
}

// Stop monitoring chat messages
function stopChatMonitoring() {
  if (chatObserver) {
    chatObserver.disconnect();
    chatObserver = null;
  }
  
  observingChat = false;
}

// Setup observer for chat content changes
function setupChatObserver() {
  // Disconnect existing observer if any
  if (chatObserver) {
    chatObserver.disconnect();
  }
  
  // Create new observer
  chatObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        checkForNewMessages();
      }
    }
  });
  
  // Find chat container and start observing
  const chatContainer = document.querySelector('.im-page--chat-body');
  if (chatContainer) {
    chatObserver.observe(chatContainer, { childList: true, subtree: true });
    console.log("VK Monitor: Chat observer started");
    
    // Do an initial check for messages
    checkForNewMessages();
  } else {
    console.log("VK Monitor: Chat container not found, will retry later");
    // Retry later in case the page is still loading
    setTimeout(setupChatObserver, 1000);
  }
}

// Setup detection for URL changes to identify chat changes
function setupUrlChangeDetection() {
  // Check if we're in a chat and extract chat ID
  checkCurrentChat();
  
  // Listen for URL changes
  setInterval(() => {
    checkCurrentChat();
  }, 1000);
}

// Check if the current page is a chat and extract chat ID
function checkCurrentChat() {
  const currentUrl = window.location.href;
  
  // Check if this is a chat page
  if (currentUrl.includes('/im?sel=c')) {
    // Extract chat ID
    const match = currentUrl.match(/\/im\?sel=c(\d+)/);
    if (match && match[1]) {
      const chatId = match[1];
      
      // If chat changed, reset processed messages
      if (lastChatId !== chatId) {
        lastChatId = chatId;
        processedMessages = new Set();
        console.log("VK Monitor: New chat detected, ID:", chatId);
        
        // Reset and setup observer for the new chat
        setupChatObserver();
      }
    }
  }
}

// Check for new messages in the current chat
function checkForNewMessages() {
  if (!config.isMonitoring || !document.querySelector('.im-page--chat-body')) return;
  
  // Find all message containers (try different selectors that might work in VK)
  const messageContainers = document.querySelectorAll('.im-mess, .im-mess--message');
  
  console.log(`VK Monitor: Checking ${messageContainers.length} messages`);
  
  for (const container of messageContainers) {
    try {
      // Get message ID or create one based on content to avoid processing the same message twice
      let messageId = container.getAttribute('data-msgid') || container.id;
      
      // If no ID attribute, create one based on content and position
      if (!messageId) {
        const text = container.textContent;
        const position = Array.from(container.parentNode.children).indexOf(container);
        messageId = `msg_${text.substring(0, 20)}_${position}`;
      }
      
      if (!messageId || processedMessages.has(messageId)) continue;
      
      // Mark as processed
      processedMessages.add(messageId);
      
      // Check if it's an incoming message (not sent by current user)
      // Try different classes/attributes VK might use
      const isIncoming = container.classList.contains('im-mess_incoming') || 
                         container.hasAttribute('data-peer') ||
                         !container.classList.contains('im-mess--out');
                         
      if (!isIncoming) continue;
      
      // Get sender ID (try different ways to find it)
      let senderId = null;
      
      // Try to get from data-peer attribute
      const peerElem = container.querySelector('[data-peer]');
      if (peerElem) {
        senderId = peerElem.getAttribute('data-peer');
      }
      
      // Try to get from the link
      if (!senderId) {
        const senderLink = container.querySelector('a.im-mess--lnk');
        if (senderLink) {
          const href = senderLink.getAttribute('href');
          if (href) {
            const idMatch = href.match(/id(\d+)/);
            if (idMatch && idMatch[1]) {
              senderId = idMatch[1];
            }
          }
        }
      }
      
      // Try to get from any data attribute with ID
      if (!senderId) {
        const possibleIdElements = container.querySelectorAll('[data-from-id]');
        if (possibleIdElements.length > 0) {
          senderId = possibleIdElements[0].getAttribute('data-from-id');
        }
      }
      
      // If we still don't have a sender ID, skip this message
      if (!senderId) continue;
      
      // Check if sender is in target users (if any are specified)
      if (config.targetUsers.length > 0 && !config.targetUsers.includes(parseInt(senderId))) {
        continue;
      }
      
      // Get message text (try different selectors)
      let messageText = "";
      const textElement = container.querySelector('.im-mess--text') || 
                         container.querySelector('.im-mess--content') ||
                         container;
      
      if (textElement) {
        messageText = textElement.textContent.toLowerCase();
      } else {
        // If we can't find the text element, use the container's text
        messageText = container.textContent.toLowerCase();
      }
      
      // Check if message contains any target words
      let containsTargetWord = false;
      let matchedWord = "";
      
      for (const word of config.targetWords) {
        if (messageText.includes(word.toLowerCase())) {
          containsTargetWord = true;
          matchedWord = word;
          break;
        }
      }
      
      if (containsTargetWord) {
        console.log(`VK Monitor: Matched message - User: ${senderId}, Text: ${messageText}`);
        
        // Play notification sound
        if (config.playSoundOnDetection) {
          notificationSound.play().catch(e => console.log("Error playing sound:", e));
        }
        
        // Log event to background
        browser.runtime.sendMessage({
          action: "logEvent",
          event: {
            type: "message_matched",
            senderId: senderId,
            messageText: messageText,
            matchedWord: matchedWord,
            chatId: lastChatId,
            timestamp: Date.now()
          }
        });
        
        // Send responses
        if (config.groupResponse) {
          sendGroupResponse(config.groupResponse);
        }
        
        if (config.privateResponse) {
          sendPrivateResponse(senderId, config.privateResponse);
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  }
}

// Send a response in the group chat
function sendGroupResponse(message) {
  // Try different selectors for the input field
  const inputField = document.querySelector('.im_editable, .im-chat-input--text, [contenteditable="true"]');
  if (!inputField) {
    console.error("VK Monitor: Could not find message input field");
    return;
  }
  
  // Focus the input field
  inputField.focus();
  
  // Set message text in the input field
  if (inputField.getAttribute('contenteditable') === 'true') {
    inputField.innerHTML = message;
  } else {
    inputField.value = message;
  }
  
  // Dispatch input event to make VK recognize the text
  const inputEvent = new Event('input', { bubbles: true });
  inputField.dispatchEvent(inputEvent);
  
  // Find and click the send button
  setTimeout(() => {
    // Try different selectors for the send button
    const sendButton = document.querySelector('.im-send-btn, .im-chat-input--send, [aria-label="Send"]');
    if (sendButton) {
      sendButton.click();
      console.log("VK Monitor: Group response sent");
    } else {
      // If no button found, try sending with Enter key
      const keyEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        keyCode: 13,
        which: 13,
        key: 'Enter',
        code: 'Enter'
      });
      inputField.dispatchEvent(keyEvent);
      console.log("VK Monitor: Tried to send with Enter key");
    }
  }, 500);
}

// Send a private message to a user
function sendPrivateResponse(userId, message) {
  // Store current chat to return later
  const currentChatUrl = window.location.href;
  
  // Open the user's chat in a new tab
  browser.runtime.sendMessage({
    action: "logEvent",
    event: {
      type: "sending_private_message",
      toUserId: userId,
      message: message
    }
  });
  
  // Create a tab to the user's chat
  browser.runtime.sendMessage({
    action: "openPrivateChat",
    userId: userId,
    message: message
  });
  
  console.log(`VK Monitor: Private response request sent for user ${userId}`);
}

// Extract current user ID
function getCurrentUserId() {
  // Try different ways to get the current user ID
  
  // Try to get it from vk.id (available in the global scope)
  if (window.vk && window.vk.id) {
    currentUserId = window.vk.id;
    console.log("VK Monitor: Current user ID from vk object:", currentUserId);
    return;
  }
  
  // Try to get from the page body data attribute
  const bodyElem = document.querySelector('body');
  if (bodyElem && bodyElem.hasAttribute('data-user-id')) {
    currentUserId = bodyElem.getAttribute('data-user-id');
    console.log("VK Monitor: Current user ID from body:", currentUserId);
    return;
  }
  
  // Try to get from profile link
  try {
    // This might change based on VK's layout
    const profileLink = document.querySelector('#l_pr a, [href*="/id"] a');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      const match = href.match(/\/id(\d+)/);
      if (match && match[1]) {
        currentUserId = match[1];
        console.log("VK Monitor: Current user ID from profile link:", currentUserId);
        return;
      }
    }
  } catch (error) {
    console.error("Error getting current user ID:", error);
  }
  
  // Try to find it in the page source
  const pageSource = document.documentElement.outerHTML;
  const idMatch = pageSource.match(/id: ?(\d+)/);
  if (idMatch && idMatch[1]) {
    currentUserId = idMatch[1];
    console.log("VK Monitor: Current user ID from page source:", currentUserId);
  }
}