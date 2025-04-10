import os
import requests
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# API base URL
API_BASE_URL = "http://localhost:5001"

def test_analyze_blob_folder():
    """
    Test the analyze-blob-folder endpoint
    """
    conversation_id = input("Enter conversation ID (folder name): ")
    
    # Call the API
    response = requests.get(f"{API_BASE_URL}/api/analyze-blob-folder?conversation_id={conversation_id}")
    
    # Print the response
    print("\nResponse Status:", response.status_code)
    if response.status_code == 200:
        print("\nResponse JSON:")
        print(json.dumps(response.json(), indent=2))
    else:
        print("\nError:", response.text)

def test_get_blob_schema():
    """
    Test the get-blob-schema endpoint
    """
    blob_path = input("Enter blob path: ")
    
    # Call the API
    response = requests.get(f"{API_BASE_URL}/api/get-blob-schema?blob_path={blob_path}")
    
    # Print the response
    print("\nResponse Status:", response.status_code)
    if response.status_code == 200:
        print("\nResponse JSON:")
        print(json.dumps(response.json(), indent=2))
    else:
        print("\nError:", response.text)

def main():
    print("Blob Schema API Test Client")
    print("==========================")
    
    while True:
        print("\nOptions:")
        print("1. Test analyze-blob-folder endpoint")
        print("2. Test get-blob-schema endpoint")
        print("3. Exit")
        
        choice = input("\nEnter your choice (1-3): ")
        
        if choice == "1":
            test_analyze_blob_folder()
        elif choice == "2":
            test_get_blob_schema()
        elif choice == "3":
            break
        else:
            print("Invalid choice. Please try again.")

if __name__ == "__main__":
    main()
