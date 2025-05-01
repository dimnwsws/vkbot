from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import time
import pickle
import os

class VKAutoResponder:
    def __init__(self):
        # Configuration
        self.vk_login = None        # Will be set during setup
        self.vk_password = None     # Will be set during setup
        self.target_user_id = None  # Will be set during setup
        self.auto_response = None   # Will be set during setup
        
        # Set up Chrome options
        self.options = webdriver.ChromeOptions()
        # Uncomment to run headless (no browser window)
        # self.options.add_argument('--headless')
        self.options.add_argument('--disable-gpu')
        self.options.add_argument('--no-sandbox')
        self.options.add_argument('--disable-dev-shm-usage')
        
        # Add user agent to avoid detection
        self.options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        
        # Initialize browser
        self.driver = None
        
        # Last message tracking
        self.last_message = ""
    
    def setup(self):
        """Initial setup and configuration"""
        print("VK Auto-Responder Setup")
        print("=======================")
        
        self.vk_login = input("Enter your VK login (email or phone): ")
        self.vk_password = input("Enter your VK password: ")
        self.target_user_id = input("Enter target user ID to monitor (e.g., id123456789 or username): ")
        self.auto_response = input("Enter your automatic response message: ")
        
        print("\nSetup complete!")
    
    def start_browser(self):
        """Start the browser session"""
        print("\nStarting browser...")
        self.driver = webdriver.Chrome(options=self.options)
        self.driver.maximize_window()
    
    def login_to_vk(self):
        """Login to VK account"""
        print("Logging into VK...")
        self.driver.get("https://vk.com/")
        
        try:
            # Wait for login form to appear
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.ID, "index_email"))
            )
            
            # Enter login credentials
            login_field = self.driver.find_element(By.ID, "index_email")
            login_field.clear()
            login_field.send_keys(self.vk_login)
            
            # Click sign in button to proceed to password
            sign_in_button = self.driver.find_element(By.CSS_SELECTOR, "[type='submit']")
            sign_in_button.click()
            
            # Wait for password field
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "[name='password']"))
            )
            
            # Enter password
            password_field = self.driver.find_element(By.CSS_SELECTOR, "[name='password']")
            password_field.clear()
            password_field.send_keys(self.vk_password)
            
            # Click continue button
            continue_button = self.driver.find_element(By.CSS_SELECTOR, "[type='submit']")
            continue_button.click()
            
            # Wait for successful login (profile link appears)
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.ID, "l_pr"))
            )
            
            print("Successfully logged in!")
            
            # Save cookies for future sessions
            pickle.dump(self.driver.get_cookies(), open("vk_cookies.pkl", "wb"))
            
        except TimeoutException:
            print("Login failed: page elements not found or timeout")
            return False
        except Exception as e:
            print(f"Login error: {e}")
            return False
            
        return True
    
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
    
    def open_chat_with_target(self):
        """Open chat with the target user"""
        print(f"Opening chat with user {self.target_user_id}...")
        
        # Navigate to the user's chat
        self.driver.get(f"https://vk.com/im/convo/279624730?entrypoint=list_all")
        
        try:
            # Wait for chat to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "im-page--chat-body"))
            )
            print("Chat loaded successfully!")
            return True
        except TimeoutException:
            print("Could not load chat: timeout")
            return False
        except Exception as e:
            print(f"Error opening chat: {e}")
            return False
    
    def check_for_new_messages(self):
        """Check for new messages from the target user"""
        try:
            # Get all message containers
            message_containers = self.driver.find_elements(By.CSS_SELECTOR, ".im-mess.im-mess_incoming")
            
            if not message_containers:
                return False
            
            # Get the last message from the other person
            last_message_container = message_containers[-1]
            last_message_text = last_message_container.find_element(By.CSS_SELECTOR, ".im-mess--text").text
            
            # Check if this is a new message
            if last_message_text != self.last_message:
                self.last_message = last_message_text
                print(f"New message detected: {last_message_text}")
                return True
                
            return False
            
        except Exception as e:
            print(f"Error checking messages: {e}")
            return False
    
    def send_response(self):
        """Send the auto-response message"""
        try:
            # Find the message input field
            message_field = self.driver.find_element(By.ID, "im_editable0")
            message_field.clear()
            
            # Type the message
            message_field.send_keys(self.auto_response)
            
            # Press Enter to send
            message_field.send_keys(Keys.RETURN)
            
            print(f"Sent response: {self.auto_response}")
            return True
            
        except Exception as e:
            print(f"Error sending response: {e}")
            return False
    
    def run(self):
        """Run the auto-responder"""
        self.setup()
        self.start_browser()
        
        # Try to load cookies first
        if not self.load_cookies():
            # If cookies don't work, login normally
            if not self.login_to_vk():
                print("Failed to login. Exiting...")
                self.driver.quit()
                return
        
        # Open chat with target user
        if not self.open_chat_with_target():
            print("Failed to open chat. Exiting...")
            self.driver.quit()
            return
        
        print("\nMonitoring chat for new messages...")
        print("Press Ctrl+C to stop")
        
        # Get the last message to avoid responding to old messages
        self.check_for_new_messages()
        
        # Main monitoring loop
        try:
            while True:
                # Check for new messages
                if self.check_for_new_messages():
                    # Send auto-response
                    self.send_response()
                
                # Refresh the page periodically to check for new messages
                self.driver.refresh()
                
                # Wait for chat to reload
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "im-page--chat-body"))
                )
                
                # Wait before checking again
                time.sleep(30)
                
        except KeyboardInterrupt:
            print("\nStopping auto-responder...")
        finally:
            self.driver.quit()

if __name__ == "__main__":
    bot = VKAutoResponder()
    bot.run()