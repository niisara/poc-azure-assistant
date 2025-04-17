from flask import Flask, request, jsonify, render_template
import os
import sys
import io
import traceback
import contextlib
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient

# Load environment variables
load_dotenv()

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify({"message": "Hello from Flask!"})

@app.route('/api/echo', methods=['POST'])
def echo():
    data = request.json
    return jsonify({"echo": data})

@app.route('/api/execute', methods=['POST'])
def execute_code():
    if not request.json or 'code' not in request.json:
        return jsonify({"error": "No code provided"}), 400
    
    code = request.json['code']
    conversation_id = request.json.get('conversationId')
    file_name = request.json.get('fileName')
    
    # Download file from Azure Blob Storage if conversation_id and file_name are provided
    local_file_path = None
    temp_file_path = None
    if conversation_id and file_name:
        try:
            storage_account_name = os.getenv('AZURE_STORAGE_ACCOUNT_NAME')
            storage_account_key = os.getenv('AZURE_STORAGE_ACCOUNT_KEY')
            container_name = os.getenv('AZURE_STORAGE_CONTAINER_NAME', 'conversations')
            if not (storage_account_name and storage_account_key):
                return jsonify({"error": "Azure Storage credentials not set in environment variables."}), 500
            blob_service_client = BlobServiceClient(
                f"https://{storage_account_name}.blob.core.windows.net",
                credential=storage_account_key
            )
            container_client = blob_service_client.get_container_client(container_name)
            blob_path = f"{conversation_id}/{file_name}"
            blob_client = container_client.get_blob_client(blob_path)
            # Save to a temp file
            temp_dir = os.path.join(os.getcwd(), 'temp')
            os.makedirs(temp_dir, exist_ok=True)
            temp_file_path = os.path.join(temp_dir, file_name)
            with open(temp_file_path, "wb") as download_file:
                download_file.write(blob_client.download_blob().readall())
            local_file_path = temp_file_path
        except Exception as ex:
            return jsonify({"error": f"Failed to download file from Azure Blob Storage: {str(ex)}"}), 500

    # Create string IO to capture stdout and stderr
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    # Result dictionary to return
    result = {
        "stdout": "",
        "stderr": "",
        "result": None,
        "error": None
    }
    
    # Execute the code in a safe environment
    try:
        # Redirect stdout and stderr
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            # Create a local environment for execution
            local_vars = {}
            # If a file path is provided, add it to the local_vars
            if local_file_path:
                local_vars['csv_file_path'] = local_file_path
            # Execute the code with the modified environment
            exec(code, local_vars, local_vars)
            # Check if there's a result variable defined
            if 'result' in local_vars:
                result["result"] = local_vars['result']
        # Get captured output
        result["stdout"] = stdout_capture.getvalue()
        result["stderr"] = stderr_capture.getvalue()
    except Exception as e:
        result["error"] = str(e)
        result["stderr"] = traceback.format_exc()
    finally:
        # Clean up the temp file if it was downloaded
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                print(f"[INFO] Removing temp file: {temp_file_path}")
                # os.remove(temp_file_path)
            except Exception:
                pass
    return jsonify(result)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
