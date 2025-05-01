// popup.js - Handles the popup UI for the extension

// DOM elements
const targetUsersInput = document.getElementById('targetUsers');
const targetWordsInput = document.getElementById('targetWords');
const groupResponseInput = document.getElementById('groupResponse');
const privateResponseInput = document.getElementById('privateResponse');
const playSoundCheck = document.getElementById('playSoundCheck');
const testSoundBtn = document.getElementById('testSoundBtn');
const statusElement = document.getElementById('status');
const saveButton = document.getElementById('saveBtn');
const toggleButton = document.getElementById('toggleBtn');
const messageElement = document.getElementById('message');
const lastScanTimeElement = document.getElementById('lastScanTime');

// Create notification sound
const notificationSound = new Audio(
  "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBkSg4fnJeSwFJHfH8N2QQAoUXrTq6KRYFApGn+D1yHhH+"
);

// Current configuration
let config = {
  targetUsers: [],
  targetWords: [],
  groupResponse: "",
  privateResponse: "",
  isMonitoring: false,
  playSoundOnDetection: true,
  lastChecked: null
};

// Initialize the popup
function initPopup() {
  // Load current configuration
  browser.runtime.sendMessage({ action: "getConfig" })
    .then(response => {
      if (response && response.config) {
        config = response.config;
        updateUIFromConfig();
      }
    })
    .catch(error => {
      console.error("Error loading configuration:", error);
      showMessage("Failed to load settings", false);
    });
  
  // Set up event listeners
  saveButton.addEventListener('click', saveConfig);
  toggleButton.addEventListener('click', toggleMonitoring);
  testSoundBtn.addEventListener('click', playTestSound);
  
  // Update last scan time every second
  setInterval(updateLastScanTime, 1000);
}

// Update UI elements based on current configuration
function updateUIFromConfig() {
  // Update input fields
  targetUsersInput.value = config.targetUsers.join(', ');
  targetWordsInput.value = config.targetWords.join(', ');
  groupResponseInput.value = config.groupResponse;
  privateResponseInput.value = config.privateResponse;
  playSoundCheck.checked = config.playSoundOnDetection !== false;
  
  // Update status display
  updateStatusUI();
  
  // Update toggle button text
  toggleButton.textContent = config.isMonitoring ? "Stop Monitoring" : "Start Monitoring";
  toggleButton.className = config.isMonitoring ? "btn btn-danger" : "btn btn-primary";
  
  // Update last scan time
  updateLastScanTime();
}

// Update the last scan time display
function updateLastScanTime() {
  if (config.lastChecked) {
    const lastTime = new Date(config.lastChecked);
    const now = new Date();
    const diffMs = now - lastTime;
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) {
      lastScanTimeElement.textContent = `${diffSec} seconds ago`;
    } else if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      lastScanTimeElement.textContent = `${mins} minute${mins > 1 ? 's' : ''} ago`;
    } else {
      const hours = Math.floor(diffSec / 3600);
      lastScanTimeElement.textContent = `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
  } else {
    lastScanTimeElement.textContent = "Never";
  }
}

// Update the status indicator
function updateStatusUI() {
  statusElement.className = config.isMonitoring ? "status active" : "status inactive";
  statusElement.textContent = `Monitoring is currently ${config.isMonitoring ? 'ON' : 'OFF'}`;
}

// Save configuration changes
function saveConfig() {
  // Extract values from UI
  const targetUsers = targetUsersInput.value
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id));
  
  const targetWords = targetWordsInput.value
    .split(',')
    .map(word => word.trim())
    .filter(word => word.length > 0);
  
  const groupResponse = groupResponseInput.value.trim();
  const privateResponse = privateResponseInput.value.trim();
  const playSoundOnDetection = playSoundCheck.checked;
  
  // Validate inputs
  if (targetWords.length === 0) {
    showMessage("Please specify at least one target word", false);
    return;
  }
  
  if (groupResponse.length === 0 && privateResponse.length === 0) {
    showMessage("Please specify at least one response message", false);
    return;
  }
  
  // Update configuration
  config.targetUsers = targetUsers;
  config.targetWords = targetWords;
  config.groupResponse = groupResponse;
  config.privateResponse = privateResponse;
  config.playSoundOnDetection = playSoundOnDetection;
  
  // Save to storage
  browser.runtime.sendMessage({
    action: "saveConfig",
    config: config
  })
    .then(response => {
      if (response.success) {
        showMessage("Settings saved successfully", true);
      } else {
        showMessage("Failed to save settings", false);
      }
    })
    .catch(error => {
      console.error("Error saving configuration:", error);
      showMessage("Failed to save settings", false);
    });
}

// Toggle monitoring state
function toggleMonitoring() {
  // Switch state
  config.isMonitoring = !config.isMonitoring;
  
  // Update UI
  updateStatusUI();
  toggleButton.textContent = config.isMonitoring ? "Stop Monitoring" : "Start Monitoring";
  toggleButton.className = config.isMonitoring ? "btn btn-danger" : "btn btn-primary";
  
  // Notify background script
  browser.runtime.sendMessage({
    action: "toggleMonitoring",
    isMonitoring: config.isMonitoring
  })
    .then(response => {
      if (response.success) {
        showMessage(`Monitoring ${config.isMonitoring ? 'started' : 'stopped'}`, true);
      } else {
        showMessage(`Failed to ${config.isMonitoring ? 'start' : 'stop'} monitoring`, false);
        // Revert UI if operation failed
        config.isMonitoring = !config.isMonitoring;
        updateStatusUI();
      }
    })
    .catch(error => {
      console.error("Error toggling monitoring:", error);
      showMessage(`Failed to ${config.isMonitoring ? 'start' : 'stop'} monitoring`, false);
      // Revert UI if operation failed
      config.isMonitoring = !config.isMonitoring;
      updateStatusUI();
    });
}

// Play test sound
function playTestSound() {
  notificationSound.play()
    .then(() => {
      console.log("Test sound played successfully");
    })
    .catch(error => {
      console.error("Error playing test sound:", error);
      showMessage("Failed to play test sound", false);
    });
}

// Show status message to the user
function showMessage(text, isSuccess) {
  messageElement.textContent = text;
  messageElement.className = isSuccess ? "message success" : "message error";
  messageElement.style.display = "block";
  
  // Hide the message after 3 seconds
  setTimeout(() => {
    messageElement.style.display = "none";
  }, 3000);
}

// Initialize when the popup is opened
document.addEventListener('DOMContentLoaded', initPopup);