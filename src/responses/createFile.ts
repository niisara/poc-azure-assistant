import { AzureOpenAI } from "openai";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import fs from "fs";
import path from "path";
import { initLogger } from '../logger';
import { Result, ok, err } from './utils/result';

const logger = initLogger();

/**
 * Determines the data type of a value from a CSV cell
 * @param value - The string value from a CSV cell
 * @returns The inferred data type as a string
 */
function inferDataType(value: string): string {
    // Remove quotes if present and trim whitespace
    const cleanValue = value.replace(/["']/g, '').trim();
    
    // Check if empty
    if (cleanValue === '') {
        return 'empty';
    }
    
    // Check if date (common formats)
    const dateRegex = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/;
    if (dateRegex.test(cleanValue)) {
        return 'date';
    }
    
    // Check if boolean
    if (['true', 'false', 'yes', 'no', '0', '1'].includes(cleanValue.toLowerCase())) {
        return 'boolean';
    }
    
    // Check if number (integer or float)
    const numberRegex = /^-?\d+(\.\d+)?$/;
    if (numberRegex.test(cleanValue)) {
        return cleanValue.includes('.') ? 'float' : 'integer';
    }
    
    // Default to string
    return 'string';
}

/**
 * Uploads a CSV file to Azure Blob Storage.
 * @param client - The OpenAI client instance
 * @param conversationId - The ID of the conversation (folder name in blob storage).
 * @param filename - The name of the file to upload.
 * @returns A Result containing the path of the uploaded file if successful, or an error if failed.
 */
export async function createFile(
    client: AzureOpenAI,
    conversationId: string,
    filename: string
): Promise<Result<string, Error>> {
    try {
        // Validate file extension - only accept CSV files
        const fileExtension = path.extname(filename).toLowerCase();
        if (fileExtension !== '.csv') {
            logger.error({ 
                message: "Invalid file format. Only CSV files are accepted",
                filename 
            });
            return err(new Error("Invalid file format. Only CSV files are accepted."));
        }

        // Get Azure Storage environment variables
        const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        const storageAccountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
        const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "conversations";

        if (!storageAccountName || !storageAccountKey) {
            logger.error({ message: "Missing Azure Storage credentials in environment variables" });
            return err(new Error("Missing Azure Storage credentials in environment variables"));
        }

        // Create the blob service client
        const sharedKeyCredential = new StorageSharedKeyCredential(
            storageAccountName,
            storageAccountKey
        );

        const blobServiceClient = new BlobServiceClient(
            `https://${storageAccountName}.blob.core.windows.net`,
            sharedKeyCredential
        );

        // Get a reference to the container and blob
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        // Create container if it doesn't exist
        await containerClient.createIfNotExists();
        
        const blobPath = `${conversationId}/${filename}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

        // Check if the file exists in the source location
        const sourcePath = path.join(process.cwd(), "uploads", filename);
        if (!fs.existsSync(sourcePath)) {
            logger.error({ 
                message: "Source file does not exist",
                sourcePath 
            });
            return err(new Error(`Source file ${sourcePath} does not exist`));
        }

        // Read the file to extract column names and infer data types
        const fileContent = fs.readFileSync(sourcePath, 'utf8');
        const lines = fileContent.split('\n');
        
        // Process the file if it has content
        if (lines.length > 0) {
            const firstLine = lines[0].trim();
            const columnNames = firstLine.split(',');
            
            // Create metadata object with column names and data types
            const metadata: Record<string, string> = {};
            
            // Store column names
            columnNames.forEach((col, index) => {
                // Remove any quotes if present and trim whitespace
                const cleanCol = col.replace(/["']/g, '').trim();
                metadata[`col${index + 1}`] = cleanCol;
            });
            
            // Infer data types from second line if available
            if (lines.length > 1) {
                const secondLine = lines[1].trim();
                const values = secondLine.split(',');
                
                // Infer and store data types
                values.forEach((value, index) => {
                    if (index < columnNames.length) {
                        const dataType = inferDataType(value);
                        metadata[`type${index + 1}`] = dataType;
                    }
                });
                
                logger.info({
                    message: "Extracted column names and inferred data types from CSV file",
                    columnInfo: Object.entries(metadata).reduce((acc, [key, value]) => {
                        // Group by column number
                        const colNum = key.replace(/[^0-9]/g, '');
                        if (!acc[colNum]) acc[colNum] = {};
                        acc[colNum][key.startsWith('col') ? 'name' : 'type'] = value;
                        return acc;
                    }, {} as Record<string, any>)
                });
            } else {
                logger.info({
                    message: "Extracted column names from CSV file (no data rows for type inference)",
                    columnNames: metadata
                });
            }

            // Upload the file to Azure Blob Storage with metadata
            logger.info({
                message: "Uploading file to Azure Blob Storage with column metadata",
                container: containerName,
                blobPath: blobPath
            });

            const fileBuffer = fs.readFileSync(sourcePath);
            await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
                blobHTTPHeaders: {
                    blobContentType: 'text/csv'
                },
                metadata: metadata
            });
        } else {
            // If file is empty, uploading without metadata
            logger.info({
                message: "CSV file appears to be empty, uploading without column metadata",
                filename
            });
            
            const fileBuffer = fs.readFileSync(sourcePath);
            await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
                blobHTTPHeaders: {
                    blobContentType: 'text/csv'
                }
            });
        }

        logger.info({
            message: "File uploaded successfully to Azure Blob Storage",
            blobPath: blobPath
        });

        return ok(blobPath);
    } catch (error) {
        logger.error({
            message: "Error uploading file to Azure Blob Storage",
            error,
            conversationId,
            filename
        });

        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
