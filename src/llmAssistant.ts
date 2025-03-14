import { getConfig } from './config';
import { initLogger } from './logger';
import { Result, err, ok } from './types';

const logger = initLogger();

const AzureOpenAI = require('openai').AzureOpenAI;

export type AssistantError = 'NO_RESPONSE' | 'ASSISTANT_ERROR' | 'TIMEOUT' | 'NOT_FOUND';

export interface ThreadState {
    threadId: string;
    assistantId: string;
    lastActivity: Date;
    useFallback?: boolean;
}

export interface LlmAssistant {
    uploadDocument: (
        filePath: string,
        purpose?: string
    ) => Promise<Result<string, AssistantError>>;
    getOrCreateAssistant: (
        name: string,
        instructions: string,
        fileIds: string[]
    ) => Promise<Result<string, AssistantError>>;
    createThread: () => Promise<Result<string, AssistantError>>;
    addMessageToThread: (
        threadId: string,
        content: string
    ) => Promise<Result<boolean, AssistantError>>;
    runAssistant: (
        threadId: string,
        assistantId: string
    ) => Promise<Result<boolean, AssistantError>>;
    getLatestAssistantMessage: (
        threadId: string
    ) => Promise<Result<string, AssistantError>>;
}

// In-memory cache of active threads
const threadCache = new Map<string, ThreadState>();

// In-memory cache of assistants by name
const assistantCache = new Map<string, string>();

export function getThreadState(conversationId: string): ThreadState | undefined {
    return threadCache.get(conversationId);
}

export function setThreadState(conversationId: string, state: ThreadState): void {
    threadCache.set(conversationId, state);
}

export async function createLlmAssistant(settings: any = null): Promise<LlmAssistant> {
    const { vault } = await getConfig();
    const apiKey = process.env.API_KEY;
    const defaultModel = process.env.DEFAULT_MODEL;
    const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const azureOpenAIVersion = process.env.AZURE_OPENAI_VERSION;

    const defaultTimeout = 3 * 60 * 1000; // 3 minutes default timeout

    // Instantiate the AzureOpenAI client with your Azure-specific settings.
    const openai = new AzureOpenAI({
        endpoint: azureOpenAIEndpoint,
        apiKey: apiKey,
        apiVersion: azureOpenAIVersion,
    });

    return {
        uploadDocument: async (filePath: string, purpose?: string): Promise<Result<string, AssistantError>> => {
            try {
                const fs = require('fs');

                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    logger.error({ msg: 'Document not found', path: filePath });
                    return err<AssistantError>('NO_RESPONSE');
                }

                logger.info({ msg: 'Uploading document to Azure OpenAI', path: filePath });
                const filePurpose = purpose ?? "assistants";

                // Upload the document using the AzureOpenAI client.
                const file = await openai.files.create({
                    file: fs.createReadStream(filePath),
                    purpose: filePurpose
                });

                if (!file?.id) {
                    logger.error({ msg: 'Failed to get file ID from Azure OpenAI' });
                    return err<AssistantError>('NO_RESPONSE');
                }

                logger.info({ msg: 'Document uploaded successfully', fileId: file.id });
                return ok(file.id);
            } catch (error) {
                logger.error({ msg: 'Error uploading document', error });
                return err<AssistantError>('NO_RESPONSE');
            }
        },

        getOrCreateAssistant: async (
            name: string,
            instructions: string,
            fileIds: string[]
        ): Promise<Result<string, AssistantError>> => {
            try {
                // Check if we already have this assistant cached
                if (assistantCache.has(name)) {
                    const assistantId = assistantCache.get(name);
                    logger.info({ msg: 'Using cached assistant', name, assistantId });
                    return ok(assistantId!);
                }

                // List all assistants and find one with the given name
                logger.info({ msg: 'Looking for existing assistant', name });
                const assistants = await openai.beta.assistants.list({ limit: 100 });

                const existingAssistant = assistants.data.find(
                    (assistant: any) => assistant.name === name
                );

                if (existingAssistant) {
                    logger.info({
                        msg: 'Found existing assistant',
                        name,
                        assistantId: existingAssistant.id
                    });

                    // Cache the assistant ID for future use
                    assistantCache.set(name, existingAssistant.id);
                    return ok(existingAssistant.id);
                }

                // If no assistant with that name exists, create a new one
                logger.info({
                    msg: 'No existing assistant found, creating new one',
                    name,
                    fileIds: fileIds
                });

                // Prepare assistant creation parameters
                const createParams: any = {
                    name: name,
                    instructions: instructions,
                    model: settings?.model ?? defaultModel,
                };

                // Only add file_search tool and file IDs if there are files to attach
                if (fileIds && fileIds.length > 0) {
                    // For Azure OpenAI, directly attach files to the assistant
                    createParams.tools = [{ type: 'retrieval' }];
                    createParams.file_ids = fileIds;

                    logger.info({
                        msg: 'Creating assistant with file retrieval capabilities',
                        fileCount: fileIds.length
                    });
                }

                const assistant = await openai.beta.assistants.create(createParams);

                if (!assistant?.id) {
                    logger.error({
                        msg: 'Failed to create assistant',
                        createParams: JSON.stringify(createParams)
                    });
                    return err<AssistantError>('ASSISTANT_ERROR');
                }

                // Cache the new assistant ID
                assistantCache.set(name, assistant.id);

                logger.info({
                    msg: 'Assistant created successfully',
                    assistantId: assistant.id,
                    hasFiles: fileIds && fileIds.length > 0
                });
                return ok(assistant.id);
            } catch (error) {
                logger.error({
                    msg: 'Error finding or creating assistant',
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                });
                return err<AssistantError>('ASSISTANT_ERROR');
            }
        },

        createThread: async (): Promise<Result<string, AssistantError>> => {
            try {
                logger.info({ msg: 'Creating new thread' });

                const thread = await openai.beta.threads.create({
                    messages: [
                        {
                            "role": "user",
                            "content": "Please analyze this transaction summary data.",
                        }
                    ]
                });

                if (!thread?.id) {
                    logger.error({ msg: 'Failed to create thread' });
                    return err<AssistantError>('ASSISTANT_ERROR');
                }

                logger.info({ msg: 'Thread created successfully', threadId: thread.id });
                return ok(thread.id);
            } catch (error) {
                logger.error({
                    msg: 'Error creating thread',
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                });
                return err<AssistantError>('ASSISTANT_ERROR');
            }
        },

        addMessageToThread: async (
            threadId: string,
            content: string
        ): Promise<Result<boolean, AssistantError>> => {
            try {
                logger.info({ msg: 'Adding message to thread', threadId });

                const message = await openai.beta.threads.messages.create(
                    threadId,
                    {
                        role: "user",
                        content: content
                    }
                );

                if (!message) {
                    logger.error({ msg: 'Failed to add message to thread' });
                    return err<AssistantError>('ASSISTANT_ERROR');
                }

                logger.info({ msg: 'Message added to thread successfully' });
                return ok(true);
            } catch (error) {
                logger.error({
                    msg: 'Error adding message to thread',
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                });
                return err<AssistantError>('ASSISTANT_ERROR');
            }
        },

        runAssistant: async (
            threadId: string,
            assistantId: string
        ): Promise<Result<boolean, AssistantError>> => {
            try {
                logger.info({ msg: 'Running assistant on thread', threadId, assistantId });

                const run = await openai.beta.threads.runs.create(
                    threadId,
                    {
                        assistant_id: assistantId
                    }
                );

                if (!run?.id) {
                    logger.error({ msg: 'Failed to run assistant' });
                    return err<AssistantError>('ASSISTANT_ERROR');
                }

                // Poll for the run to complete
                let runStatus = await openai.beta.threads.runs.retrieve(
                    threadId,
                    run.id
                );

                const startTime = Date.now();
                const maxWaitTime = settings?.timeout ?? defaultTimeout;

                while (["queued", "in_progress", "requires_action"].includes(runStatus.status)) {
                    if (Date.now() - startTime > maxWaitTime) {
                        logger.error({ msg: 'Assistant run timed out', threadId, runId: run.id });
                        return err<AssistantError>('TIMEOUT');
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    runStatus = await openai.beta.threads.runs.retrieve(
                        threadId,
                        run.id
                    );
                }

                if (runStatus.status !== "completed") {
                    logger.error({
                        msg: 'Run failed with non-completed status',
                        status: runStatus.status,
                        threadId,
                        runId: run.id
                    });
                    return err<AssistantError>('ASSISTANT_ERROR');
                }

                logger.info({ msg: 'Assistant run completed successfully', threadId, runId: run.id });
                return ok(true);
            } catch (error) {
                logger.error({
                    msg: 'Error running assistant',
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                });
                return err<AssistantError>('ASSISTANT_ERROR');
            }
        },

        getLatestAssistantMessage: async (
            threadId: string
        ): Promise<Result<string, AssistantError>> => {
            try {
                logger.info({ msg: 'Getting latest assistant message', threadId });

                const messages = await openai.beta.threads.messages.list(threadId);

                if (!messages?.data?.length) {
                    logger.error({ msg: 'No messages found in thread' });
                    return err<AssistantError>('NO_RESPONSE');
                }

                const assistantMessages = messages.data.filter((msg: { role: string }) => msg.role === "assistant");

                if (assistantMessages.length === 0) {
                    logger.error({ msg: 'No assistant messages found in thread' });
                    return err<AssistantError>('NO_RESPONSE');
                }

                const latestMessage = assistantMessages[0];
                let responseText = "";
                for (const contentPart of latestMessage.content) {
                    if (contentPart.type === "text") {
                        responseText += contentPart.text.value;
                    }
                }

                if (!responseText) {
                    logger.error({ msg: 'Empty response from assistant' });
                    return err<AssistantError>('NO_RESPONSE');
                }

                logger.info({
                    msg: 'Retrieved latest assistant message successfully',
                    threadId,
                    messageLength: responseText.length
                });

                return ok(responseText);
            } catch (error) {
                logger.error({
                    msg: 'Error getting latest assistant message',
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                });
                return err<AssistantError>('NO_RESPONSE');
            }
        }
    };
}