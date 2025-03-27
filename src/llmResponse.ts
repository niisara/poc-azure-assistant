import dotenv from "dotenv";
import { AzureOpenAI } from "openai";
import { getConfig } from './config';
import { initLogger } from './logger';
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import fs from "fs";
import path from "path";
import { createReadStream } from "fs";
import { ResponseCreateParamsNonStreaming, ResponseInputContent, ResponseInputItem } from "openai/resources/responses/responses";

// Define the Result type with correct interface
interface Ok<T> {
    type: 'ok';
    data: T;
}

interface Err<E> {
    type: 'error';
    error: E;
}

type Result<T, E> = Ok<T> | Err<E>;

function ok<T>(data: T): Ok<T> {
    return { type: 'ok', data };
}

function err<E>(error: E): Err<E> {
    return { type: 'error', error };
}

// Load environment variables from .env
dotenv.config();

const logger = initLogger();

export interface LlmResponse {
    getLLMResponse: (prompt: string, fileIds?: string[]) => Promise<string>;
    uploadFileFromStorage: (conversationId: string, fileName: string) => Promise<Result<string, Error>>;
    uploadAllFilesFromConversation: (conversationId: string) => Promise<Result<string[], Error>>;
}

export async function createLlmResponse(settings: any = null): Promise<LlmResponse> {
    const { vault } = await getConfig();

    // Get environment variables
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.API_KEY;
    const deploymentName = process.env.DEFAULT_MODEL;
    const apiVersion = process.env.AZURE_OPENAI_VERSION;

    if (!endpoint || !apiKey || !deploymentName) {
        logger.error({ message: "Missing required environment variables: AZURE_OPENAI_ENDPOINT, API_KEY, or DEFAULT_MODEL" });
        throw new Error("Missing required environment variables: AZURE_OPENAI_ENDPOINT, API_KEY, or DEFAULT_MODEL");
    }

    // Initialize the OpenAI client with Azure configuration
    const credential = new DefaultAzureCredential();
    const scope = "https://cognitiveservices.azure.com/.default";
    const azureADTokenProvider = getBearerTokenProvider(credential, scope);
    const options = { endpoint, apiKey, deploymentName, apiVersion }

    const client = new AzureOpenAI(options);

    /**
     * Sends a prompt to OpenAI using the responses API.
     * @param prompt - The text prompt for which to generate a response.
     * @param fileIds - Optional array of file IDs. IDs prefixed with "vs_" will be treated as file search IDs.
     * @returns The generated response as a string.
     */
    const getLLMResponse = async (
        prompt: string,
        fileIds?: string[]
    ): Promise<string> => {
        try {
            // Separate regular file IDs from file search IDs (prefixed with vs_)
            const regularFileIds = fileIds?.filter(id => !id.startsWith("vs_")) || [];
            const fileSearchIds = fileIds?.filter(id => id.startsWith("vs_")) || [];

            logger.info({
                message: "Sending response request to OpenAI",
                model: deploymentName,
                regularFileIdsCount: regularFileIds.length,
                fileSearchIdsCount: fileSearchIds.length
            });

            // Create a strongly typed request options object
            let requestOptions: ResponseCreateParamsNonStreaming = {
                input: prompt,
                model: deploymentName,
                stream: false
            };

            // Handle regular file IDs
            if (regularFileIds.length > 0) {
                // Create content array with text prompt
                const content: ResponseInputContent[] = [{ type: "input_text", text: prompt }];

                // Add all file IDs in a single input_file entry
                if (regularFileIds.length > 0) {
                    content.push({
                        type: "input_file",
                        file_id: regularFileIds[0] // Note: OpenAI API expects a single file_id, not an array
                    });

                    // If there are multiple files, add them as separate entries
                    if (regularFileIds.length > 1) {
                        for (let i = 1; i < regularFileIds.length; i++) {
                            content.push({
                                type: "input_file",
                                file_id: regularFileIds[i]
                            });
                        }
                    }
                }

                const inputItems: ResponseInputItem[] = [
                    {
                        role: "user",
                        content,
                        type: "message"
                    }
                ];

                requestOptions.input = inputItems;
            } else {
                // Default case with just prompt
                requestOptions.input = prompt;
            }

            // Handle file search IDs
            if (fileSearchIds.length > 0) {
                requestOptions.tools = [{
                    type: "file_search",
                    vector_store_ids: fileSearchIds,
                }];
            }

            // Use the responses API
            const response = await client.responses.create(requestOptions);

            if (response.output_text && response.output_text.length > 0) {
                const responseText = response.output_text;
                logger.info({
                    message: "Received response from OpenAI",
                    model: deploymentName,
                    usage: response.usage
                });
                return responseText ?? "";
            } else {
                logger.error({ message: "No response text found in OpenAI response" });
                throw new Error("No response text found in OpenAI response");
            }
        } catch (error) {
            logger.error({
                message: "Error getting response from OpenAI",
                error,
                fileIdsProvided: !!fileIds && fileIds.length > 0
            });
            throw error;
        }
    };

    /**
     * Downloads a file from Azure Blob Storage and uploads it to OpenAI.
     * @param conversationId - The ID of the conversation (folder name in blob storage).
     * @param fileName - The name of the file to download.
     * @returns A Result containing the OpenAI file ID if successful, or an error if failed.
     */
    const uploadFileFromStorage = async (
        conversationId: string,
        fileName: string
    ): Promise<Result<string, Error>> => {
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
    };

    /**
     * Downloads and uploads all files from a specific conversation in Azure Blob Storage to OpenAI.
     * @param conversationId - The ID of the conversation (folder name in blob storage).
     * @returns A Result containing an array of OpenAI file IDs if successful, or an error if failed.
     */
    const uploadAllFilesFromConversation = async (
        conversationId: string
    ): Promise<Result<string[], Error>> => {
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
                const result = await uploadFileFromStorage(conversationId, fileName);

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
    };

    return {
        getLLMResponse,
        uploadFileFromStorage,
        uploadAllFilesFromConversation
    };
}