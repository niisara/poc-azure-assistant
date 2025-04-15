import dotenv from "dotenv";
import {  OpenAI } from "openai";
import { getConfig } from './config';
import { initLogger } from './logger';
import { Result, err, ok } from './types';
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

// Load environment variables from .env
dotenv.config();

const logger = initLogger();

export interface LlmResponse {
    getLLMResponse: (prompt: string) => Promise<string>;
    getPythonCodeResponse: (prompt: string, conversationId?: string) => Promise<{ result: any, error: string | null }>;
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
    const credential = new DefaultAzureCredential();
    const scope = "https://cognitiveservices.azure.com/.default";
    const azureADTokenProvider = getBearerTokenProvider(credential, scope);
    const options = { endpoint, apiKey, deploymentName, apiVersion }

    const client = new OpenAI({apiKey});

    /**
     * Sends a prompt to OpenAI using the new responses API.
     * @param prompt - The text prompt for which to generate a response.
     * @returns The generated response as a string.
     */
    const getLLMResponse = async (prompt: string): Promise<string> => {
        try {
            logger.info({ message: "Sending response request to OpenAI", model: deploymentName });

            // Use the responses API instead of the chat completions API
            const response = await client.responses.create({
                input:prompt,
                model: deploymentName
            });

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
            logger.error({ message: "Error getting response from OpenAI", error });
            throw error;
        }
    };

    /**
     * Sends a prompt to OpenAI and returns ONLY Python code (no explanations, no markdown).
     * @param prompt - The text prompt for which to generate Python code.
     * @param conversationId - Optional conversation ID (currently unused in this implementation)
     * @returns An object with result (the generated Python code) and error (if any)
     */
    const getPythonCodeResponse = async (prompt: string, conversationId?: string): Promise<{ result: any, error: string | null }> => {
        try {
            logger.info({ message: "Sending Python code response request to OpenAI", model: deploymentName, conversationId });
            const codeOnlyPrompt = `${prompt.trim()}\nRespond ONLY with valid Python code. Do not include any explanation, markdown, or extra text.`;
            const response = await client.responses.create({
                input: codeOnlyPrompt,
                model: deploymentName
            });
            if (response.output_text && response.output_text.length > 0) {
                const responseText = response.output_text;
                logger.info({
                    message: "Received Python code from OpenAI",
                    model: deploymentName,
                    usage: response.usage
                });
                return { result: responseText, error: null };
            } else {
                logger.error({ message: "No Python code found in OpenAI response" });
                return { result: null, error: "No Python code found in OpenAI response" };
            }
        } catch (error) {
            logger.error({ message: "Error getting Python code from OpenAI", error });
            return { result: null, error: error instanceof Error ? error.message : String(error) };
        }
    };

    return {
        getLLMResponse,
        getPythonCodeResponse
    };
}
