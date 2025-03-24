import dotenv from "dotenv";
import { AzureOpenAI } from "openai";
import { getConfig } from './config';
import { initLogger } from './logger';
import { Result, err, ok } from './types';
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

// Load environment variables from .env
dotenv.config();

const logger = initLogger();

export interface LlmChatCompletion {
    getLlmChatCompletion: (prompt: string) => Promise<string>;
}

export async function createLlmChatCompletion(settings: any = null): Promise<LlmChatCompletion> {
    const { vault } = await getConfig();

    // Get environment variables
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.API_KEY;
    const deploymentName = process.env.DEFAULT_MODEL;
    const apiVersion = process.env.AZURE_OPENAI_VERSION || "2025-01-01-preview";

    if (!endpoint || !apiKey || !deploymentName) {
        logger.error({ message: "Missing required environment variables: AZURE_OPENAI_ENDPOINT, API_KEY, or DEFAULT_MODEL" });
        throw new Error("Missing required environment variables: AZURE_OPENAI_ENDPOINT, API_KEY, or DEFAULT_MODEL");
    }

    // Initialize the OpenAI client with Azure configuration
    const credential = new DefaultAzureCredential();
    const scope = "https://cognitiveservices.azure.com/.default";
    const azureADTokenProvider = getBearerTokenProvider(credential, scope);
    const openai = new AzureOpenAI({
        // azureADTokenProvider: azureADTokenProvider,
        apiKey: apiKey,
        deployment: endpoint,
        apiVersion: apiVersion
    });

    /**
     * Sends a prompt to OpenAI using the OpenAI package.
     * @param prompt - The text prompt for which to generate a completion.
     * @returns The generated completion as a string.
     */
    const getLlmChatCompletion = async (prompt: string): Promise<string> => {
        try {
            logger.info({ message: "Sending completion request to OpenAI", model: deploymentName });

            // Use the completions API
            const completion = await openai.chat.completions.create({
                messages: [{
                    role:'user',
                    content: prompt
                }],
                model: deploymentName,
                max_tokens: 150,
                temperature: 0.7,
            });

            if (completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
                const completionText = completion.choices[0].message;
                logger.info({
                    message: "Received completion from OpenAI",
                    model: deploymentName,
                    usage: completion.usage
                });

                return completionText.content ?? "";
            } else {
                logger.error({ message: "No completion text found in OpenAI response" });
                throw new Error("No completion text found in OpenAI response");
            }
        } catch (error) {
            logger.error({ message: "Error getting completion from OpenAI", error });
            throw error;
        }
    };

    return {
        getLlmChatCompletion
    };
}