// background.js - Handles background tasks and communication between components

// Default configuration
const defaultConfig = {
  targetUsers: [],
  targetWords: [],
  groupResponse: "This message contains a monitored word.",
  privateResponse: "Your message in the group chat contained a monitored word.",
  isMonitoring: false,
  playSoundOnDetection: true,
  lastChecked: null
};

// Initialize extension data
browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.get('config')
    .then(result => {
      if (!result.config) {
        browser.storage.local.set({ config: defaultConfig });
        console.log("Extension installed, default configuration set.");
      }
    })
    .catch(error => console.error("Error initializing configuration:", error));
});

// Listen for messages from content script or popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getConfig") {
    // Return current configuration
    browser.storage.local.get('config')
      .then(result => {
        sendResponse({ config: result.config || defaultConfig });
      })
      .catch(error => {
        console.error("Error getting configuration:", error);
        sendResponse({ error: "Failed to get configuration" });
      });
    return true; // Indicates async response
  } 
  else if (message.action === "saveConfig") {
    // Save new configuration
    browser.storage.local.set({ config: message.config })
      .then(() => {
        sendResponse({ success: true });
        // Notify content script of config change
        notifyConfigChange(message.config);
      })
      .catch(error => {
        console.error("Error saving configuration:", error);
        sendResponse({ error: "Failed to save configuration" });
      });
    return true; // Indicates async response
  }
  else if (message.action === "toggleMonitoring") {
    // Toggle monitoring state
    browser.storage.local.get('config')
      .then(result => {
        const config = result.config || defaultConfig;
        config.isMonitoring = message.isMonitoring;
        
        return browser.storage.local.set({ config });
      })
      .then(() => {
        sendResponse({ success: true });
        // Notify content script of monitoring state change
        notifyMonitoringChange(message.isMonitoring);
      })
      .catch(error => {
        console.error("Error toggling monitoring:", error);
        sendResponse({ error: "Failed to toggle monitoring" });
      });
    return true; // Indicates async response
  }
  else if (message.action === "logEvent") {
    // Log an event from content script
    console.log("Event from content script:", message.event);
    
    // Update lastChecked timestamp
    browser.storage.local.get('config')
      .then(result => {
        const config = result.config || defaultConfig;
        config.lastChecked = Date.now();
        return browser.storage.local.set({ config });
      })
      .catch(error => {
        console.error("Error updating lastChecked:", error);
      });
    
    // Could store events in storage for a log view
    sendResponse({ success: true });
    return true;
  }
  else if (message.action === "openPrivateChat") {
    // Open a private chat to a user
    const userId = message.userId;
    const messageText = message.message;
    
    // Create a new tab to the user's chat
    browser.tabs.create({
      url: `https://vk.com/im?sel=${userId}`
    }).then(tab => {
      // We would ideally inject a content script to send the message,
      // but that requires more complex code to handle message sending
      // in a new tab context. For simplicity, we'll just open the chat.
      console.log(`Opened chat with user ${userId} in new tab`);
    }).catch(error => {
      console.error("Error opening private chat:", error);
    });
    
    sendResponse({ success: true });
    return true;
  }
});

// Notify all content scripts of configuration change
function notifyConfigChange(config) {
  browser.tabs.query({ url: "*://*.vk.com/*" })
    .then(tabs => {
      for (const tab of tabs) {
        browser.tabs.sendMessage(tab.id, {
          action: "configUpdated",
          config: config
        }).catch(error => {
          // Ignore errors for tabs where content script isn't running
          console.log(`Could not update tab ${tab.id}:`, error);
        });
      }
    })
    .catch(error => console.error("Error notifying tabs:", error));
}

// Notify all content scripts of monitoring state change
function notifyMonitoringChange(isMonitoring) {
  browser.tabs.query({ url: "*://*.vk.com/*" })
    .then(tabs => {
      for (const tab of tabs) {
        browser.tabs.sendMessage(tab.id, {
          action: "monitoringToggled",
          isMonitoring: isMonitoring
        }).catch(error => {
          // Ignore errors for tabs where content script isn't running
          console.log(`Could not update tab ${tab.id}:`, error);
        });
      }
    })
    .catch(error => console.error("Error notifying tabs:", error));
}