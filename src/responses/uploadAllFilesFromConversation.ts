import { AzureOpenAI } from "openai";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { initLogger } from '../logger';
import { Result, ok, err } from './utils/result';
import { uploadFileFromStorage } from './uploadFileFromStorage';

const logger = initLogger();

/**
 * Downloads and uploads all files from a specific conversation in Azure Blob Storage to OpenAI.
 * @param client - The OpenAI client instance
 * @param conversationId - The ID of the conversation (folder name in blob storage).
 * @returns A Result containing an array of OpenAI file IDs if successful, or an error if failed.
 */
export async function uploadAllFilesFromConversation(
    client: AzureOpenAI,
    conversationId: string
): Promise<Result<string[], Error>> {
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

        // Get a reference to the container
        const containerClient = blobServiceClient.getContainerClient(containerName);

        // List all blobs in the conversation folder
        logger.info({
            message: "Listing files in conversation folder",
            container: containerName,
            conversationId: conversationId
        });

        const fileList: string[] = [];
        const prefix = `${conversationId}/`;

        // Use the listBlobsFlat method and filter by the conversation prefix
        for await (const blob of containerClient.listBlobsFlat({ prefix })) {
            // Extract just the filename from the full path
            const fileName = blob.name.replace(prefix, '');
            if (fileName) {  // Ensure we don't add empty filenames
                fileList.push(fileName);
            }
        }

        if (fileList.length === 0) {
            logger.error({
                message: "No files found in the conversation folder",
                container: containerName,
                conversationId: conversationId
            });
            return ok([]);
        }

        logger.info({
            message: "Found files in conversation folder",
            fileCount: fileList.length,
            conversationId: conversationId
        });

        // Upload each file and collect the file IDs
        const fileIds: string[] = [];
        const failedFiles: string[] = [];

        for (const fileName of fileList) {
            const result = await uploadFileFromStorage(client, conversationId, fileName);

            if (result.type === 'ok') {
                fileIds.push(result.data);
            } else {
                failedFiles.push(fileName);
                logger.error({
                    message: "Failed to upload file",
                    fileName: fileName,
                    error: result.error.message
                });
            }
        }

        if (failedFiles.length > 0) {
            logger.error({
                message: "Some files failed to upload",
                failedCount: failedFiles.length,
                failedFiles: failedFiles
            });
        }

        logger.info({
            message: "Completed uploading files to OpenAI",
            successCount: fileIds.length,
            failedCount: failedFiles.length,
            conversationId: conversationId
        });

        return ok(fileIds);
    } catch (error) {
        logger.error({
            message: "Error listing or uploading files from conversation",
            error,
            conversationId
        });

        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
