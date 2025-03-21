import dotenv from "dotenv";
import OpenAI from "openai";
import { getConfig } from './config';
import { initLogger } from './logger';
import { Result, err, ok } from './types';

// Load environment variables from .env
dotenv.config();

const logger = initLogger();

export interface LlmResponse {
    getLLMResponse: (prompt: string) => Promise<string>;
}

export async function createLlmResponse(settings: any = null): Promise<LlmResponse> {
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
    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: `${endpoint}/openai/deployments/${deploymentName}`,
        defaultQuery: { "api-version": apiVersion },
        defaultHeaders: { "api-key": apiKey }
    });

    /**
     * Sends a prompt to OpenAI using the OpenAI package.
     * @param prompt - The text prompt for which to generate a completion.
     * @returns The generated completion as a string.
     */
    const getLLMResponse = async (prompt: string): Promise<string> => {
        try {
            logger.info({ message: "Sending completion request to OpenAI", model: deploymentName });
            
            // Use the completions API
            const completion = await openai.completions.create({
                model: deploymentName,
                prompt: prompt,
                max_tokens: 150,
                temperature: 0.7,
            });

            if (completion.choices && completion.choices.length > 0 && completion.choices[0].text) {
                const completionText = completion.choices[0].text;
                logger.info({
                    message: "Received completion from OpenAI",
                    model: deploymentName,
                    usage: completion.usage
                });
                
                return completionText;
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
        getLLMResponse
    };
}