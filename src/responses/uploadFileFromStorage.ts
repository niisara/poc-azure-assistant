import { AzureOpenAI } from "openai";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import fs from "fs";
import path from "path";
import { createReadStream } from "fs";
import { initLogger } from '../logger';
import { Result, ok, err } from './utils/result';

const logger = initLogger();

/**
 * Downloads a file from Azure Blob Storage and uploads it to OpenAI.
 * @param client - The OpenAI client instance
 * @param conversationId - The ID of the conversation (folder name in blob storage).
 * @param fileName - The name of the file to download.
 * @returns A Result containing the OpenAI file ID if successful, or an error if failed.
 */
export async function uploadFileFromStorage(
    client: AzureOpenAI,
    conversationId: string,
    fileName: string
): Promise<Result<string, Error>> {
    const tempFilePath = path.join(process.cwd(), "temp", fileName);

    try {
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
        const blobPath = `${conversationId}/${fileName}`;
        const blobClient = containerClient.getBlobClient(blobPath);

        // Ensure temp directory exists
        if (!fs.existsSync(path.dirname(tempFilePath))) {
            fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });
        }

        // Download the blob to a local file
        logger.info({
            message: "Downloading file from Azure Blob Storage",
            container: containerName,
            blobPath: blobPath
        });

        await blobClient.downloadToFile(tempFilePath);

        // Upload the file to OpenAI
        logger.info({
            message: "Uploading file to OpenAI",
            fileName: fileName
        });

        const fileStream = createReadStream(tempFilePath);
        const response = await client.files.create({
            file: fileStream,
            purpose: "assistants"
        });

        // Clean up the temporary file
        fs.unlinkSync(tempFilePath);

        logger.info({
            message: "File uploaded successfully to OpenAI",
            fileId: response.id
        });

        return ok(response.id);
    } catch (error) {
        // Clean up the temporary file if it exists
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        logger.error({
            message: "Error downloading and uploading file",
            error,
            conversationId,
            fileName
        });

        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
