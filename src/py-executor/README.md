# Simple Flask Application

This is a basic Flask web application with a simple API.

## Features

- Web interface with GET and POST API testing
- `/api/hello` endpoint that returns a simple JSON message
- `/api/echo` endpoint that echoes back the JSON data sent to it

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

## Environment Variables

You can customize the application using the following environment variables:

- `PORT`: The port on which the application will run (default: 5000)

Create a `.env` file in the root directory to set these variables.
