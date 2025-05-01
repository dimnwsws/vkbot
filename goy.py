from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.firefox.options import Options as FirefoxOptions
import time
import pickle
import os
import json

class VKMessageScanner:
    def __init__(self):
        # Configuration
        self.vk_login = None        # Will be set during setup
        self.vk_password = None     # Will be set during setup (may not be used with Firefox profile)
        self.group_chat_id = None   # Will be set during setup
        self.target_users = []      # Will be set during setup
        self.target_words = []      # Will be set during setup
        self.group_response = None  # Will be set during setup
        self.private_response = None # Will be set during setup
        self.firefox_profile_path = None # Will be set during setup
        
        # Initialize browser options
        self.options = FirefoxOptions()
        
        # Initialize browser
        self.driver = None
        
        # Message tracking
        self.processed_messages = set()
        
        # Config file
        self.config_file = "vk_scanner_config.json"
    
    def load_config(self):
        """Load configuration from file if exists"""
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                self.vk_login = config.get('vk_login')
                self.vk_password = config.get('vk_password')
                self.group_chat_id = config.get('group_chat_id')
                self.target_users = config.get('target_users', [])
                self.target_words = config.get('target_words', [])
                self.group_response = config.get('group_response')
                self.private_response = config.get('private_response')
                self.firefox_profile_path = config.get('firefox_profile_path')
                return True
            except Exception as e:
                print(f"Error loading config: {e}")
                return False
        return False
    
    def save_config(self):
        """Save configuration to file"""
        config = {
            'vk_login': self.vk_login,
            'vk_password': self.vk_password,
            'group_chat_id': self.group_chat_id,
            'target_users': self.target_users,
            'target_words': self.target_words,
            'group_response': self.group_response,
            'private_response': self.private_response,
            'firefox_profile_path': self.firefox_profile_path
        }
        
        try:
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=4)
            print("Configuration saved successfully.")
        except Exception as e:
            print(f"Error saving config: {e}")
    
    def setup(self):
        """Initial setup and configuration"""
        print("VK Message Scanner Setup")
        print("=======================")
        
        # Try to load existing configuration
        if self.load_config():
            print("Loaded existing configuration.")
            change = input("Do you want to change the configuration? (y/n): ").lower()
            if change != 'y':
                return
        
        # Optional: login credentials
        use_profile = input("Do you want to use your existing Firefox profile? (y/n): ").lower()
        if use_profile == 'y':
            # Get Firefox profile directory
            print("\nFirefox Profile Instructions:")
            print("1. Open Firefox and type 'about:profiles' in the address bar")
            print("2. Find your 'Root Directory' under the profile you use for VK")
            print("3. Copy the full path and paste it below")
            self.firefox_profile_path = input("\nEnter your Firefox profile path: ")
            
            # Skip login credentials when using Firefox profile
            self.vk_login = "Using Firefox Profile"
            self.vk_password = "Not Required"
        else:
            self.vk_login = input("Enter your VK login (email or phone): ")
            self.vk_password = input("Enter your VK password: ")
            self.firefox_profile_path = None
        
        self.group_chat_id = input("Enter group chat ID to monitor: ")
        
        # Get target users
        target_users_input = input("Enter user IDs to monitor (comma-separated): ")
        self.target_users = [user.strip() for user in target_users_input.split(',')]
        
        # Get target words
        target_words_input = input("Enter words to search for (comma-separated): ")
        self.target_words = [word.strip().lower() for word in target_words_input.split(',')]
        
        self.group_response = input("Enter response message to send in group chat: ")
        self.private_response = input("Enter response message to send to the user directly: ")
        
        # Save configuration
        self.save_config()
        
        print("\nSetup complete!")
    
    def start_browser(self):
        """Start the browser session using the Firefox profile if available"""
        print("\nStarting Firefox browser...")
        
        if self.firefox_profile_path and os.path.exists(self.firefox_profile_path):
            print(f"Using Firefox profile from: {self.firefox_profile_path}")
            from selenium.webdriver.firefox.firefox_profile import FirefoxProfile
            
            # Create a Firefox profile object
            firefox_profile = FirefoxProfile(self.firefox_profile_path)
            
            # Create a Firefox driver with the profile
            self.driver = webdriver.Firefox(firefox_profile=firefox_profile, options=self.options)
        else:
            # Fall back to regular Firefox instance if no profile or invalid path
            print("No valid Firefox profile path, using default Firefox instance")
            self.driver = webdriver.Firefox(options=self.options)
            
        self.driver.maximize_window()
    
    def login_to_vk(self):
        """Login to VK account with updated selectors"""
        print("Logging into VK...")
        self.driver.get("https://vk.com/")
        
        try:
            # Wait for the initial login page to load
            WebDriverWait(self.driver, 10).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, "input[name='login']"))
            )
            
            # Enter login (email or phone)
            login_field = self.driver.find_element(By.CSS_SELECTOR, "input[name='login']")
            login_field.clear()
            login_field.send_keys(self.vk_login)
            
            # Find and click the Sign In button
            sign_in_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            sign_in_button.click()
            
            # Wait for password field (could be different flow paths depending on VK's current auth)
            try:
                # First try: direct password field
                WebDriverWait(self.driver, 5).until(
                    EC.visibility_of_element_located((By.CSS_SELECTOR, "input[name='password']"))
                )
                password_field = self.driver.find_element(By.CSS_SELECTOR, "input[name='password']")
            except TimeoutException:
                # Alternative: might need to click something first to get to password
                try:
                    WebDriverWait(self.driver, 5).until(
                        EC.visibility_of_element_located((By.CSS_SELECTOR, "button[type='submit']"))
                    )
                    self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
                    
                    # Now wait for password field
                    WebDriverWait(self.driver, 5).until(
                        EC.visibility_of_element_located((By.CSS_SELECTOR, "input[name='password']"))
                    )
                    password_field = self.driver.find_element(By.CSS_SELECTOR, "input[name='password']")
                except:
                    # Try one more selector pattern
                    WebDriverWait(self.driver, 5).until(
                        EC.visibility_of_element_located((By.CSS_SELECTOR, "input[type='password']"))
                    )
                    password_field = self.driver.find_element(By.CSS_SELECTOR, "input[type='password']")
            
            # Enter password
            password_field.clear()
            password_field.send_keys(self.vk_password)
            
            # Click submit/continue button
            continue_button = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            continue_button.click()
            
            # There might be an additional security confirmation step
            try:
                WebDriverWait(self.driver, 5).until(
                    EC.visibility_of_element_located((By.CSS_SELECTOR, "button.vkuiButton"))
                )
                confirm_button = self.driver.find_element(By.CSS_SELECTOR, "button.vkuiButton")
                confirm_button.click()
            except:
                # No confirmation needed, proceed
                pass
            
            # Wait for successful login by checking for profile/feed elements
            try:
                # Check for several possible indicators of successful login
                WebDriverWait(self.driver, 10).until(
                    EC.any_of(
                        EC.presence_of_element_located((By.ID, "l_pr")),
                        EC.presence_of_element_located((By.ID, "feed_rows")),
                        EC.presence_of_element_located((By.CLASS_NAME, "side_bar_nav")),
                        EC.presence_of_element_located((By.CSS_SELECTOR, "[aria-label='Моя страница']"))
                    )
                )
                print("Successfully logged in!")
                
                # Save cookies for future sessions
                pickle.dump(self.driver.get_cookies(), open("vk_cookies.pkl", "wb"))
                return True
                
            except TimeoutException:
                print("Login verification failed: couldn't detect successful login")
                # Take screenshot for debugging
                self.driver.save_screenshot("login_failed.png")
                print("Screenshot saved as login_failed.png")
                return False
                
        except TimeoutException as e:
            print(f"Login failed: page elements not found or timeout - {e}")
            # Take screenshot for debugging
            self.driver.save_screenshot("login_error.png")
            print("Screenshot saved as login_error.png")
            return False
        except Exception as e:
            print(f"Login error: {e}")
            # Take screenshot for debugging
            self.driver.save_screenshot("login_error.png")
            print("Screenshot saved as login_error.png")
            return False
    
    def load_cookies(self):
        """Load saved cookies if available"""
        if os.path.exists("vk_cookies.pkl"):
            try:
                self.driver.get("https://vk.com/")
                cookies = pickle.load(open("vk_cookies.pkl", "rb"))
                for cookie in cookies:
                    self.driver.add_cookie(cookie)
                self.driver.refresh()
                
                # Check if still logged in
                try:
                    WebDriverWait(self.driver, 5).until(
                        EC.presence_of_element_located((By.ID, "l_pr"))
                    )
                    print("Logged in using saved cookies!")
                    return True
                except:
                    print("Cookies expired, need to login again")
                    return False
                    
            except Exception as e:
                print(f"Error loading cookies: {e}")
                return False
        return False
    
    def open_group_chat(self):
        """Open the group chat"""
        print(f"Opening group chat {self.group_chat_id}...")
        
        # Navigate to the group chat
        self.driver.get(f"https://vk.com/im?sel=c{self.group_chat_id}")
        
        try:
            # Wait for chat to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "im-page--chat-body"))
            )
            print("Group chat loaded successfully!")
            return True
        except TimeoutException:
            print("Could not load group chat: timeout")
            return False
        except Exception as e:
            print(f"Error opening group chat: {e}")
            return False
    
    def scan_messages(self):
        """Scan messages in the group chat for target users and words"""
        try:
            # Get all message containers
            message_containers = self.driver.find_elements(By.CSS_SELECTOR, ".im-mess")
            
            if not message_containers:
                return []
            
            new_matches = []
            
            # Process messages from newest to oldest
            for container in reversed(message_containers):
                try:
                    # Get message ID to track if we've processed it before
                    message_id = container.get_attribute("data-msgid")
                    
                    # Skip if already processed
                    if message_id in self.processed_messages:
                        continue
                    
                    # Mark as processed
                    self.processed_messages.add(message_id)
                    
                    # Get sender ID
                    sender_element = container.find_element(By.CSS_SELECTOR, ".im-mess--lnk")
                    sender_id = sender_element.get_attribute("data-peer")
                    
                    # Check if sender is in target users
                    if sender_id in self.target_users or len(self.target_users) == 0:
                        # Get message text
                        message_text = container.find_element(By.CSS_SELECTOR, ".im-mess--text").text.lower()
                        
                        # Check if message contains any target words
                        for word in self.target_words:
                            if word in message_text:
                                new_matches.append({
                                    "message_id": message_id,
                                    "sender_id": sender_id,
                                    "message_text": message_text
                                })
                                break
                        
                except Exception as e:
                    print(f"Error processing message: {e}")
                    continue
            
            return new_matches
            
        except Exception as e:
            print(f"Error scanning messages: {e}")
            return []
    
    def send_group_response(self):
        """Send response in the group chat"""
        try:
            # Find the message input field
            message_field = self.driver.find_element(By.ID, "im_editable0")
            message_field.clear()
            
            # Type the message
            message_field.send_keys(self.group_response)
            
            # Press Enter to send
            message_field.send_keys(Keys.RETURN)
            
            print(f"Sent group response: {self.group_response}")
            return True
            
        except Exception as e:
            print(f"Error sending group response: {e}")
            return False
    
    def send_private_response(self, user_id):
        """Send private response to a specific user"""
        try:
            # Save current URL to return to group chat later
            current_url = self.driver.current_url
            
            # Navigate to user's chat
            self.driver.get(f"https://vk.com/im?sel={user_id}")
            
            # Wait for chat to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.ID, "im_editable0"))
            )
            
            # Find the message input field
            message_field = self.driver.find_element(By.ID, "im_editable0")
            message_field.clear()
            
            # Type the message
            message_field.send_keys(self.private_response)
            
            # Press Enter to send
            message_field.send_keys(Keys.RETURN)
            
            print(f"Sent private response to user {user_id}: {self.private_response}")
            
            # Return to group chat
            self.driver.get(current_url)
            
            # Wait for group chat to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "im-page--chat-body"))
            )
            
            return True
            
        except Exception as e:
            print(f"Error sending private response: {e}")
            # Try to return to group chat
            self.driver.get(current_url)
            return False
    
    def run(self):
        """Run the message scanner"""
        self.setup()
        self.start_browser()
        
        # Skip login process if using Firefox profile (already logged in)
        logged_in = False
        if self.firefox_profile_path and os.path.exists(self.firefox_profile_path):
            # Test if we're already logged in by navigating to VK
            self.driver.get("https://vk.com/")
            try:
                # Check for logged-in state by looking for profile elements
                WebDriverWait(self.driver, 10).until(
                    EC.any_of(
                        EC.presence_of_element_located((By.ID, "l_pr")),
                        EC.presence_of_element_located((By.ID, "feed_rows")),
                        EC.presence_of_element_located((By.CLASS_NAME, "side_bar_nav")),
                        EC.presence_of_element_located((By.CSS_SELECTOR, "[aria-label='Моя страница']"))
                    )
                )
                print("Already logged in via Firefox profile!")
                logged_in = True
            except:
                print("Not logged in with Firefox profile, falling back to normal login")
                logged_in = False
        
        # Try to load cookies first if not using profile
        if not logged_in and not self.load_cookies():
            # If cookies don't work, login normally
            if not self.login_to_vk():
                print("Failed to login. Exiting...")
                self.driver.quit()
                return
        
        # Open group chat
        if not self.open_group_chat():
            print("Failed to open group chat. Exiting...")
            self.driver.quit()
            return
        
        print("\nMonitoring group chat for messages...")
        print(f"Target users: {', '.join(self.target_users) if self.target_users else 'All users'}")
        print(f"Target words: {', '.join(self.target_words)}")
        print("Press Ctrl+C to stop")
        
        # Main monitoring loop
        try:
            while True:
                # Scan for new messages that match criteria
                matches = self.scan_messages()
                
                # Process matches
                for match in matches:
                    print(f"Match found! User {match['sender_id']} said: {match['message_text']}")
                    
                    # Send response in group chat
                    self.send_group_response()
                    
                    # Send private message to sender
                    self.send_private_response(match['sender_id'])
                
                # Refresh the page to get new messages
                self.driver.refresh()
                
                # Wait for chat to reload
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "im-page--chat-body"))
                )
                
                # Wait before checking again
                time.sleep(10)
                
        except KeyboardInterrupt:
            print("\nStopping message scanner...")
        finally:
            self.driver.quit()

if __name__ == "__main__":
    scanner = VKMessageScanner()
    scanner.run()