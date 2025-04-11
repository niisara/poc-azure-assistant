import { AzureOpenAI } from "openai";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import fs from "fs";
import path from "path";
import { initLogger } from '../logger';
import { Result, ok, err } from './utils/result';

const logger = initLogger();

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

        // Upload the file to Azure Blob Storage
        logger.info({
            message: "Uploading file to Azure Blob Storage",
            container: containerName,
            blobPath: blobPath
        });

        const fileBuffer = fs.readFileSync(sourcePath);
        await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
            blobHTTPHeaders: {
                blobContentType: 'text/csv'
            }
        });

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
