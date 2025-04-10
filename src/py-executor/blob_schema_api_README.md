# Blob Schema API

This Flask API analyzes CSV files stored in Azure Blob Storage, determines their schema by examining the first 5 rows, and updates the metadata for each file with schema information.

## Features

- Reads all CSV files in a specified blob folder (conversation ID)
- Automatically detects data types for each column
- Updates blob metadata with schema information
- Provides endpoints to analyze folders and retrieve schema information

## Setup

1. Ensure you have the required environment variables:
   - `AZURE_STORAGE_CONNECTION_STRING`: Your Azure Storage connection string
   - `BLOB_CONTAINER_NAME`: The container name where CSV files are stored (defaults to 'csvfiles')

2. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```

## API Endpoints

### 1. Analyze Blob Folder

Analyzes all CSV files in a specified folder and updates their metadata.

- **URL**: `/api/analyze-blob-folder`
- **Method**: GET
- **Query Parameters**:
  - `conversation_id`: The folder name/prefix in blob storage

**Example Request**:
```
GET /api/analyze-blob-folder?conversation_id=conversation123
```

**Example Response**:
```json
{
  "conversation_id": "conversation123",
  "files_processed": 2,
  "results": [
    {
      "blob_name": "conversation123/file1.csv",
      "schema": [
        {"name": "date", "type": "date"},
        {"name": "sales", "type": "integer"},
        {"name": "transactions", "type": "integer"}
      ]
    },
    {
      "blob_name": "conversation123/file2.csv",
      "schema": [
        {"name": "product", "type": "string"},
        {"name": "price", "type": "float"}
      ]
    }
  ]
}
```

### 2. Get Blob Schema

Retrieves the schema for a specific blob.

- **URL**: `/api/get-blob-schema`
- **Method**: GET
- **Query Parameters**:
  - `blob_path`: The full path to the blob in the container

**Example Request**:
```
GET /api/get-blob-schema?blob_path=conversation123/file1.csv
```

**Example Response**:
```json
{
  "blob_path": "conversation123/file1.csv",
  "schema": [
    {"name": "date", "type": "date"},
    {"name": "sales", "type": "integer"},
    {"name": "transactions", "type": "integer"}
  ]
}
```

## Running the API

```
python blob_schema_api.py
```

The API will run on port 5001 by default (configurable via the `PORT` environment variable).
