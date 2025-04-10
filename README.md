# Azure Assistant CLI Tool

This document provides instructions on how to use the command-line interface (CLI) tool for interacting with the Azure Assistant API.

## Prerequisites

- Node.js installed on your system
- Access to the Azure Assistant API

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```

## Configuration

The CLI tool uses the following environment variables:

- `API_BASE_URL`: The base URL of the API (defaults to `http://localhost:3000` if not set)

You can set this in your `.env` file or directly in your environment.

## Running the CLI

To start the CLI tool, run:

```
node cli.js
```

Or if you've made it executable:

```
./cli.js
```

## Main Menu

The CLI provides a main menu with the following options:

1. **Health Check** - Check if the API is running correctly
2. **Get LLM Completion** - Get a completion from the language model
3. **Upload File** - Upload a file to the system
4. **Get All File IDs** - Retrieve all file IDs for a conversation
5. **Completion with Files** - Get a completion with context from specific files
6. **Vector Store Menu** - Access vector store operations (submenu)
7. **Exit** - Exit the CLI

## Vector Store Menu

The Vector Store submenu provides these options:

1. **Create Vector Store from Files** - Create a vector store from specified files
2. **Create Vector Store from Conversation** - Create a vector store from a conversation
3. **Get Vector Stores for Conversation** - List vector stores for a specific conversation
4. **Create Batched Vector Stores** - Create vector stores in batches from files
5. **Create Batched Vector Stores from Conversation** - Create batched vector stores from a conversation
6. **Completion with File Search** - Get a completion with context from file search
7. **Back to Main Menu** - Return to the main menu

## Usage Examples

### Health Check

Select option 1 from the main menu to verify the API is running properly.

### Getting LLM Completion

1. Select option 2 from the main menu
2. Enter your prompt when prompted
3. View the API response

### Uploading a File

1. Select option 3 from the main menu
2. Enter the conversation ID when prompted
3. Enter the filename when prompted
4. View the API response

### Creating a Vector Store from Files

1. Select option 6 from the main menu to access the Vector Store menu
2. Select option 1 from the Vector Store menu
3. Enter file IDs (comma-separated or as JSON array)
4. Enter metadata as a JSON object (or leave empty)
5. View the API response

### Completion with File Search

1. Select option 6 from the main menu to access the Vector Store menu
2. Select option 6 from the Vector Store menu
3. Enter your prompt when prompted
4. Enter the conversation ID when prompted
5. Enter the number of files to search (default is 5)
6. View the API response

## Input Formats

- **File IDs**: Can be entered as comma-separated values (`id1,id2,id3`) or as a JSON array (`[id1,id2,id3]`)
- **Metadata**: Must be entered as a valid JSON object (`{"key": "value"}`)

## Error Handling

The CLI provides colored output to distinguish between:
- Regular prompts (green)
- Processing messages (yellow)
- Responses (cyan)
- Errors (red)

If an API call fails, the CLI will display detailed error information including status code and response data when available.

## Tips

- Use the Vector Store menu for advanced document retrieval and search operations
- For batch operations, you can specify the batch size to control processing
- The CLI will return to the appropriate menu after each operation
- Press Ctrl+C at any time to exit the CLI
