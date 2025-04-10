import os
import subprocess
import sys
import time
import webbrowser

def print_header(message):
    """Print a formatted header message"""
    print("\n" + "=" * 80)
    print(f" {message}")
    print("=" * 80)

def print_info(message):
    """Print an info message"""
    print(f"[INFO] {message}")

def print_error(message):
    """Print an error message"""
    print(f"[ERROR] {message}")

def print_success(message):
    """Print a success message"""
    print(f"[SUCCESS] {message}")

# Set the Azure Storage credentials
print_header("Setting up Azure Blob Storage CSV Schema API")

# Azure Storage credentials
os.environ['AZURE_STORAGE_ACCOUNT_NAME'] = '...'
os.environ['AZURE_STORAGE_ACCOUNT_KEY'] = '...'
os.environ['AZURE_STORAGE_CONTAINER_NAME'] = 'conversations'

# Flask configuration
os.environ['PORT'] = '5001'
os.environ['DEBUG'] = 'True'

print_info("Environment variables set:")
print_info(f"  AZURE_STORAGE_ACCOUNT_NAME: {os.environ['AZURE_STORAGE_ACCOUNT_NAME']}")
print_info(f"  AZURE_STORAGE_CONTAINER_NAME: {os.environ['AZURE_STORAGE_CONTAINER_NAME']}")
print_info(f"  PORT: {os.environ['PORT']}")

# Check if required packages are installed
try:
    import flask
    import azure.storage.blob
    import pandas
    print_success("All required packages are installed")
except ImportError as e:
    print_error(f"Missing required package: {e}")
    print_info("Installing required packages...")
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
    print_success("Packages installed")

print_header("Starting the CSV Schema API")
print_info("The API will be available at: http://localhost:5001")
print_info("API Documentation: http://localhost:5001/")
print_info("Test Connection: http://localhost:5001/api/test-connection")
print_info("Press Ctrl+C to stop the API")

# Open the API documentation in a web browser after a short delay
def open_browser():
    time.sleep(2)  # Wait for the server to start
    webbrowser.open('http://localhost:5001/')

# Start the browser in a separate thread
import threading
threading.Thread(target=open_browser).start()

# Run the blob_schema_api.py script
try:
    subprocess.run([sys.executable, 'blob_schema_api.py'])
except KeyboardInterrupt:
    print_header("API stopped by user")
except Exception as e:
    print_error(f"Error running the API: {e}")
    sys.exit(1)
