import dotenv from "dotenv";
import { AzureOpenAI } from "openai";
import { getConfig } from './config';
import { initLogger } from './logger';
import { Result, err, ok } from './types';
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

// Load environment variables from .env
dotenv.config();

const logger = initLogger();

export interface LlmResponse {
    getLLMResponse: (prompt: string, fileIds?: string[]) => Promise<string>;
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

            let requestOptions: any = {
                model: deploymentName
            };

            // Handle regular file IDs
            if (regularFileIds.length > 0) {
                // Create content array with text prompt
                const content: any[] = [{ type: "input_text", text: prompt }];
                
                // Add each file ID as separate content item
                regularFileIds.forEach(fileId => {
                    content.push({
                        type: "input_file",
                        file_id: fileId,
                    });
                });
                
                requestOptions.input = [
                    {
                        role: "user",
                        content: content,
                    },
                ];
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

    return {
        getLLMResponse
    };
}
