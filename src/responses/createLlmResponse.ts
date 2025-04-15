import dotenv from "dotenv";
import { AzureOpenAI } from "openai";
import { getConfig } from '../config';
import { initLogger } from '../logger';
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { LlmResponse } from './types';
import { getLLMResponse, getPythonCodeResponse } from './getLLMResponse';
import { uploadFileFromStorage } from './uploadFileFromStorage';
import { uploadAllFilesFromConversation } from './uploadAllFilesFromConversation';
import { createVectorStoreFromFiles } from './createVectorStoreFromFiles';
import { createVectorStoreFromConversation } from './createVectorStoreFromConversation';
import { getVectorStoresForConversation } from './getVectorStoresForConversation';
import { createBatchedVectorStores } from './createBatchedVectorStores';
import { createBatchedVectorStoresFromConversation } from './createBatchedVectorStoresFromConversation';
import { createFile } from './createFile';

// Load environment variables from .env
dotenv.config();

const logger = initLogger();

/**
 * Creates and returns an LlmResponse instance with all the necessary methods
 * for interacting with OpenAI and Azure Blob Storage.
 * @param settings - Optional settings to configure the LlmResponse.
 * @returns A Promise that resolves to an LlmResponse instance.
 */
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

    return {
        getLLMResponse: (prompt: string, fileIds?: string[]) => 
            getLLMResponse(client, deploymentName, prompt, fileIds),
        getPythonCodeResponse: (prompt: string, conversationId?: string) =>
            getPythonCodeResponse(client, deploymentName, prompt, conversationId),
        uploadFileFromStorage: (conversationId: string, fileName: string) => 
            uploadFileFromStorage(client, conversationId, fileName),
        uploadAllFilesFromConversation: (conversationId: string) => 
            uploadAllFilesFromConversation(client, conversationId),
        createVectorStoreFromFiles: (fileIds: string[], metadata?: Record<string, any>) => 
            createVectorStoreFromFiles(client, fileIds, metadata),
        createVectorStoreFromConversation: (conversationId: string, metadata?: Record<string, any>) => 
            createVectorStoreFromConversation(client, conversationId, metadata),
        getVectorStoresForConversation: (conversationId: string) => 
            getVectorStoresForConversation(client, conversationId),
        createBatchedVectorStores: (fileIds: string[], batchSize?: number, metadata?: Record<string, any>) => 
            createBatchedVectorStores(client, fileIds, batchSize, metadata),
        createBatchedVectorStoresFromConversation: (conversationId: string, batchSize?: number, metadata?: Record<string, any>) => 
            createBatchedVectorStoresFromConversation(client, conversationId, batchSize, metadata),
        createFile: (conversationId: string, filename: string) => 
            createFile(client, conversationId, filename)
    };
}
