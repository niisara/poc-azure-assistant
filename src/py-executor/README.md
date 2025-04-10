# Python Code Executor

This is a Flask web application that allows you to execute Python code dynamically and view the results.

## Features

- **Python Code Execution**: Enter Python code in the browser and execute it on the server
- **Real-time Results**: View standard output, return values, and errors in real-time
- **Code Editor**: Syntax highlighting and code formatting with CodeMirror
- **API Endpoints**:
  - `/api/execute` - Execute Python code and return results
  - `/api/hello` - Simple GET endpoint that returns a JSON message
  - `/api/echo` - POST endpoint that echoes back the JSON data sent to it

## Setup and Installation

1. Make sure you have Python installed (3.7+ recommended)

2. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Run the application:
   ```
   python app.py
   ```

4. Open your browser and navigate to `http://localhost:5000`

## API Usage

### Execute Python Code

**Endpoint**: `/api/execute`

**Method**: POST

**Request Body**:
```json
{
  "code": "# Your Python code here\nresult = 2 + 2\nprint('Hello, world!')"
}
```

**Response**:
```json
{
  "stdout": "Hello, world!",
  "stderr": "",
  "result": 4,
  "error": null
}
```

- `stdout`: Captured standard output
- `stderr`: Captured standard error
- `result`: The value of the `result` variable if defined in your code
- `error`: Any exception that occurred during execution

## Security Considerations

This application executes arbitrary Python code, which can be a security risk. In a production environment, you should:

1. Implement proper authentication and authorization
2. Run the code in a sandboxed environment
3. Set resource limits to prevent excessive CPU or memory usage
4. Restrict access to sensitive system resources

## Environment Variables

You can customize the application using the following environment variables:

- `PORT`: The port on which the application will run (default: 5000)

Create a `.env` file in the root directory to set these variables.
