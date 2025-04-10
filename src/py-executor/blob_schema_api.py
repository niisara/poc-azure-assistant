from flask import Flask, request, jsonify, render_template
import os
import io
import csv
import json
import pandas as pd
import numpy as np
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient, BlobClient, ContainerClient
import logging
import sys
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('blob_schema_api.log')
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Azure Blob Storage settings
AZURE_STORAGE_ACCOUNT_NAME = os.getenv('AZURE_STORAGE_ACCOUNT_NAME')
AZURE_STORAGE_ACCOUNT_KEY = os.getenv('AZURE_STORAGE_ACCOUNT_KEY')
CONTAINER_NAME = os.getenv('AZURE_STORAGE_CONTAINER_NAME', 'conversations')

# Validate required environment variables
if not AZURE_STORAGE_ACCOUNT_NAME or not AZURE_STORAGE_ACCOUNT_KEY:
    logger.error("Missing required environment variables: AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY must be set")
    print("ERROR: Missing required environment variables. Please check the .env file or set them manually.")
    print("Required variables: AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY")
    sys.exit(1)

app = Flask(__name__)

def get_data_type(sample_values):
    """
    Determine the data type of a column based on sample values
    """
    # Remove None and empty values for type detection
    sample_values = [val for val in sample_values if val is not None and val != '']
    
    if not sample_values:
        return 'string'  # Default to string for empty columns
    
    # Try to convert to different types
    try:
        # Check if all values are dates
        pd.to_datetime(sample_values)
        return 'date'
    except:
        pass
    
    try:
        # Check if all values are numeric
        numeric_values = [float(val) for val in sample_values]
        
        # Check if all values are integers
        if all(float(val).is_integer() for val in sample_values):
            return 'integer'
        return 'float'
    except:
        pass
    
    # Check if all values are boolean-like
    bool_values = ['true', 'false', 'yes', 'no', '0', '1', 't', 'f', 'y', 'n']
    if all(str(val).lower() in bool_values for val in sample_values):
        return 'boolean'
    
    # Default to string
    return 'string'

def get_csv_schema(csv_content):
    """
    Analyze CSV content and return schema information
    """
    try:
        # Read CSV content
        csv_file = io.StringIO(csv_content.decode('utf-8'))
        reader = csv.reader(csv_file)
        
        # Get header row
        header = next(reader)
        
        # Read up to 5 rows for type detection
        rows = []
        for _ in range(5):
            try:
                rows.append(next(reader))
            except StopIteration:
                break
        
        # Determine column types
        schema = []
        for i, column_name in enumerate(header):
            # Extract values for this column from the sample rows
            column_values = [row[i] if i < len(row) else None for row in rows]
            data_type = get_data_type(column_values)
            
            schema.append({
                "name": column_name,
                "type": data_type
            })
        
        return schema
    except Exception as e:
        logger.error(f"Error analyzing CSV schema: {str(e)}")
        logger.error(traceback.format_exc())
        raise

def get_blob_service_client():
    """
    Create and return a blob service client using account name and key
    """
    try:
        connection_string = f"DefaultEndpointsProtocol=https;AccountName={AZURE_STORAGE_ACCOUNT_NAME};AccountKey={AZURE_STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net"
        return BlobServiceClient.from_connection_string(connection_string)
    except Exception as e:
        logger.error(f"Error creating blob service client: {str(e)}")
        logger.error(traceback.format_exc())
        raise

@app.route('/')
def home():
    """
    Home page with API documentation
    """
    return render_template('blob_schema_api.html')

@app.route('/api/test-connection', methods=['GET'])
def test_connection():
    """
    Test the connection to Azure Blob Storage
    """
    try:
        # Create the blob service client
        blob_service_client = get_blob_service_client()
        
        # List containers to test connection
        containers = list(blob_service_client.list_containers(max_results=5))
        
        # Check if our target container exists
        container_exists = any(container.name == CONTAINER_NAME for container in containers)
        
        return jsonify({
            "status": "success",
            "message": "Successfully connected to Azure Blob Storage",
            "account_name": AZURE_STORAGE_ACCOUNT_NAME,
            "container_name": CONTAINER_NAME,
            "container_exists": container_exists,
            "containers_found": len(containers)
        })
    except Exception as e:
        logger.error(f"Error testing connection: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "status": "error",
            "message": str(e),
            "error_details": traceback.format_exc()
        }), 500

@app.route('/api/analyze-blob-folder', methods=['GET'])
def analyze_blob_folder():
    """
    Analyze all CSV files in a specified blob folder and update their metadata
    """
    try:
        # Get conversation ID (folder name) from query parameters
        conversation_id = request.args.get('conversation_id')
        if not conversation_id:
            return jsonify({"error": "Missing conversation_id parameter"}), 400
        
        logger.info(f"Analyzing blob folder for conversation ID: {conversation_id}")
        
        # Create the blob service client
        blob_service_client = get_blob_service_client()
        container_client = blob_service_client.get_container_client(CONTAINER_NAME)
        
        # List all blobs in the folder
        blob_prefix = f"{conversation_id}/"
        blobs = list(container_client.list_blobs(name_starts_with=blob_prefix))
        
        logger.info(f"Found {len(blobs)} blobs with prefix {blob_prefix}")
        
        results = []
        csv_count = 0
        
        # Process each CSV file
        for blob in blobs:
            blob_name = blob.name
            
            # Skip if not a CSV file
            if not blob_name.lower().endswith('.csv'):
                continue
                
            csv_count += 1
            logger.info(f"Processing CSV blob: {blob_name}")
            
            # Get blob client
            blob_client = container_client.get_blob_client(blob_name)
            
            # Download blob content
            blob_content = blob_client.download_blob().readall()
            
            # Analyze CSV schema
            schema = get_csv_schema(blob_content)
            
            # Convert schema to a string that can be stored in metadata
            schema_json = json.dumps(schema)
            
            # Update blob metadata
            metadata = {
                'schema': schema_json,
                'columns_count': str(len(schema)),
                'analyzed': 'true',
                'analyzed_timestamp': pd.Timestamp.now().isoformat()
            }
            
            # Set metadata on the blob
            blob_client.set_blob_metadata(metadata)
            
            results.append({
                "blob_name": blob_name,
                "schema": schema
            })
        
        if csv_count == 0:
            logger.warning(f"No CSV files found in folder {conversation_id}")
        
        return jsonify({
            "conversation_id": conversation_id,
            "files_processed": len(results),
            "total_blobs_found": len(blobs),
            "csv_files_found": csv_count,
            "results": results
        })
        
    except Exception as e:
        logger.error(f"Error processing blob folder: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "status": "error",
            "message": str(e),
            "error_details": traceback.format_exc()
        }), 500

@app.route('/api/get-blob-schema', methods=['GET'])
def get_blob_schema():
    """
    Get the schema for a specific blob
    """
    try:
        # Get blob path from query parameters
        blob_path = request.args.get('blob_path')
        if not blob_path:
            return jsonify({"error": "Missing blob_path parameter"}), 400
        
        logger.info(f"Getting schema for blob: {blob_path}")
        
        # Create the blob service client
        blob_service_client = get_blob_service_client()
        container_client = blob_service_client.get_container_client(CONTAINER_NAME)
        
        # Get blob client
        blob_client = container_client.get_blob_client(blob_path)
        
        # Get blob metadata
        properties = blob_client.get_blob_properties()
        metadata = properties.metadata
        
        if 'schema' in metadata:
            # Parse the schema from metadata
            try:
                schema = json.loads(metadata['schema'])
                return jsonify({
                    "blob_path": blob_path,
                    "schema": schema,
                    "columns_count": metadata.get('columns_count', '0'),
                    "analyzed_timestamp": metadata.get('analyzed_timestamp', 'unknown')
                })
            except json.JSONDecodeError:
                logger.warning(f"Invalid schema JSON in metadata for {blob_path}. Re-analyzing.")
                # If schema is invalid JSON, re-analyze the blob
                pass
        
        # If metadata doesn't exist or schema is invalid, analyze the blob
        blob_content = blob_client.download_blob().readall()
        schema = get_csv_schema(blob_content)
        
        # Convert schema to a string that can be stored in metadata
        schema_json = json.dumps(schema)
        
        # Update blob metadata
        metadata = {
            'schema': schema_json,
            'columns_count': str(len(schema)),
            'analyzed': 'true',
            'analyzed_timestamp': pd.Timestamp.now().isoformat()
        }
        
        # Set metadata on the blob
        blob_client.set_blob_metadata(metadata)
        
        return jsonify({
            "blob_path": blob_path,
            "schema": schema,
            "columns_count": str(len(schema)),
            "analyzed_timestamp": metadata['analyzed_timestamp'],
            "note": "Schema was not previously available and has been generated now"
        })
        
    except Exception as e:
        logger.error(f"Error getting blob schema: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "status": "error",
            "message": str(e),
            "error_details": traceback.format_exc()
        }), 500

@app.route('/api/list-conversations', methods=['GET'])
def list_conversations():
    """
    List all conversation folders in the container
    """
    try:
        # Create the blob service client
        blob_service_client = get_blob_service_client()
        container_client = blob_service_client.get_container_client(CONTAINER_NAME)
        
        # List all blobs
        blobs = list(container_client.list_blobs())
        
        # Extract conversation IDs (folder names)
        conversations = set()
        for blob in blobs:
            # Split the blob name by '/' and take the first part as the conversation ID
            parts = blob.name.split('/')
            if len(parts) > 1:
                conversations.add(parts[0])
        
        return jsonify({
            "container_name": CONTAINER_NAME,
            "conversation_count": len(conversations),
            "conversations": sorted(list(conversations))
        })
        
    except Exception as e:
        logger.error(f"Error listing conversations: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "status": "error",
            "message": str(e),
            "error_details": traceback.format_exc()
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    debug = os.getenv('DEBUG', 'True').lower() in ('true', '1', 't')
    
    logger.info(f"Starting Flask API on port {port} with debug={debug}")
    logger.info(f"Azure Storage Account: {AZURE_STORAGE_ACCOUNT_NAME}")
    logger.info(f"Container Name: {CONTAINER_NAME}")
    
    # Test the connection to Azure Blob Storage before starting the server
    try:
        blob_service_client = get_blob_service_client()
        containers = list(blob_service_client.list_containers(max_results=5))
        container_exists = any(container.name == CONTAINER_NAME for container in containers)
        
        if container_exists:
            logger.info(f"Successfully connected to Azure Blob Storage. Container '{CONTAINER_NAME}' exists.")
        else:
            logger.warning(f"Container '{CONTAINER_NAME}' not found. Available containers: {[c.name for c in containers]}")
            
    except Exception as e:
        logger.error(f"Error connecting to Azure Blob Storage: {str(e)}")
        logger.error(traceback.format_exc())
        print(f"ERROR: Could not connect to Azure Blob Storage: {str(e)}")
        print("Please check your credentials and try again.")
        sys.exit(1)
    
    print(f"Starting Flask API on port {port}...")
    print(f"API Documentation: http://localhost:{port}/")
    print(f"Test Connection: http://localhost:{port}/api/test-connection")
    app.run(debug=debug, host='0.0.0.0', port=port)
