from flask import Flask, request, jsonify, render_template
import os
import sys
import io
import traceback
import contextlib
from dotenv import load_dotenv

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
            
            # Execute the code with the modified environment
            # Use the same dict for globals and locals so function defs are visible to comprehensions
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
    
    return jsonify(result)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
