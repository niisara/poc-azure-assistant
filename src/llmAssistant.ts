// assistantService.ts
import dotenv from "dotenv";
import { AzureOpenAI } from "openai";
import { getConfig } from './config';
import { initLogger } from './logger';
import { Result, err, ok } from './types';
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

// Load environment variables from .env
dotenv.config();

const logger = initLogger();

// Assistant ID to use
const ASSISTANT_ID = process.env.AZURE_OPENAI_ASSISTANTID;

export interface AssistantResponse {
    getAssistantResponse: (message: string, threadId?: string) => Promise<{
        response: string;
        threadId: string;
    }>;
}

export async function createAssistantClient(settings: any = null): Promise<AssistantResponse> {
    const { vault } = await getConfig();

    // Get environment variables
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_VERSION || "2025-01-01-preview";

    if (!endpoint || !apiKey) {
        logger.error({ message: "Missing required environment variables: AZURE_OPENAI_ENDPOINT or API_KEY" });
        throw new Error("Missing required environment variables: AZURE_OPENAI_ENDPOINT or API_KEY");
    }

    // Initialize the OpenAI client with Azure configuration
    const credential = new DefaultAzureCredential();
    const scope = "https://cognitiveservices.azure.com/.default";
    const azureADTokenProvider = getBearerTokenProvider(credential, scope);
    const options = { endpoint, apiKey, apiVersion };

    const client = new AzureOpenAI(options);

    /**
     * Creates a new thread or retrieves an existing one for the assistant conversation
     * @param existingThreadId - Optional existing thread ID to continue a conversation
     * @returns The thread ID as a string
     */
    const getOrCreateThread = async (existingThreadId?: string): Promise<string> => {
        try {
            console.log(existingThreadId)
            if (existingThreadId) {
                // Verify the thread exists by trying to retrieve it
                await client.beta.threads.retrieve(existingThreadId);
                logger.info({ message: "Using existing thread", threadId: existingThreadId });
                return existingThreadId;
            } else {
                // Create a new thread
                const thread = await client.beta.threads.create();
                logger.info({ message: "Created new thread", threadId: thread.id });
                return thread.id;
            }
        } catch (error) {
            // If the thread retrieval fails, create a new one
            if (existingThreadId) {
                logger.error({
                    message: "Could not retrieve existing thread, creating a new one",
                    threadId: existingThreadId,
                    error
                });
                const thread = await client.beta.threads.create();
                logger.info({ message: "Created new thread", threadId: thread.id });
                return thread.id;
            }

            logger.error({ message: "Error managing thread", error });
            throw error;
        }
    };

    /**
     * Sends a message to the assistant and gets its response
     * @param message - The user's message text
     * @param threadId - Optional thread ID for continuing a conversation
     * @returns The assistant's response text and the thread ID
     */
    const getAssistantResponse = async (message: string, threadId?: string): Promise<{
        response: string;
        threadId: string;
    }> => {
        try {
            if (!message) {
                throw new Error("Message cannot be empty");
            }

            logger.info({ message: "Processing assistant request", assistantId: ASSISTANT_ID });

            // Get or create a thread
            const currentThreadId = await getOrCreateThread(threadId);
            console.log('------------')
            console.log(currentThreadId)
            console.log('------------')
            // Add the user message to the thread
            await client.beta.threads.messages.create(currentThreadId, {
                role: "user",
                content: message
            });

            // Run the assistant on the thread
            const run = await client.beta.threads.runs.create(currentThreadId, {
                assistant_id: ASSISTANT_ID ?? ""
            });

            // Poll for the run to complete
            let runStatus = await client.beta.threads.runs.retrieve(currentThreadId, run.id);

            // Wait for the run to complete (polling with exponential backoff)
            let waitTime = 1000; // Start with 1 second
            const maxWaitTime = 10000; // Maximum wait of 10 seconds

            while (runStatus.status !== "completed" &&
                runStatus.status !== "failed" &&
                runStatus.status !== "cancelled" &&
                runStatus.status !== "expired") {

                // Wait before checking again
                await new Promise(resolve => setTimeout(resolve, waitTime));

                // Increase wait time exponentially (up to the maximum)
                waitTime = Math.min(waitTime * 1.5, maxWaitTime);

                // Check status again
                runStatus = await client.beta.threads.runs.retrieve(currentThreadId, run.id);
            }

            if (runStatus.status !== "completed") {
                logger.error({
                    message: "Assistant run did not complete successfully",
                    status: runStatus.status,
                    threadId: currentThreadId,
                    runId: run.id
                });
                throw new Error(`Assistant run failed with status: ${runStatus.status}`);
            }

            // Get the assistant's messages
            const messages = await client.beta.threads.messages.list(currentThreadId, {
                order: "desc",
                limit: 1
            });

            // Get the last message from the assistant
            const assistantMessage = messages.data.find(msg => msg.role === "assistant");

            if (!assistantMessage || !assistantMessage.content || assistantMessage.content.length === 0) {
                logger.error({ message: "No assistant response found" });
                throw new Error("No assistant response found");
            }

            // Extract the text content from the message
            const responseContent = assistantMessage.content[0];
            let responseText = "";

            if (responseContent.type === "text") {
                responseText = responseContent.text.value;
            } else {
                logger.error({
                    message: "Unexpected content type in assistant response",
                    contentType: responseContent.type
                });
                responseText = "Received non-text response from assistant";
            }

            logger.info({
                message: "Received response from assistant",
                threadId: currentThreadId,
                runId: run.id
            });

            return {
                response: responseText,
                threadId: currentThreadId
            };

        } catch (error) {
            logger.error({ message: "Error getting response from assistant", error });
            throw error;
        }
    };

    return {
        getAssistantResponse
    };
}