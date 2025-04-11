import { AzureOpenAI } from "openai";
import { initLogger } from '../logger';
import { Result, ok, err } from './utils/result';
import { uploadAllFilesFromConversation } from './uploadAllFilesFromConversation';
import { createVectorStoreFromFiles } from './createVectorStoreFromFiles';

const logger = initLogger();

/**
 * Creates a vector store from all files in a conversation.
 * This function uploads all files from a conversation and then creates a vector store from them.
 * @param client - The OpenAI client instance
 * @param conversationId - The ID of the conversation.
 * @param metadata - Optional metadata for the vector store.
 * @returns A Result containing the vector store ID if successful, or an error if failed.
 */
export async function createVectorStoreFromConversation(
    client: AzureOpenAI,
    conversationId: string,
    metadata?: Record<string, any>
): Promise<Result<string, Error>> {
    try {
        // First, upload all files from the conversation
        const uploadResult = await uploadAllFilesFromConversation(client, conversationId);

        if (uploadResult.type === 'error') {
            return err(uploadResult.error);
        }

        const fileIds = uploadResult.data;

        if (fileIds.length === 0) {
            logger.info({
                message: "No files found in conversation to create vector store",
                conversationId
            });
            return err(new Error("No files found in conversation to create vector store"));
        }

        // Create metadata with conversation ID if not provided
        const vectorMetadata = metadata || {
            conversationId,
            createdAt: new Date().toISOString()
        };

        // Create vector store from the uploaded files
        const vectorStoreResult = await createVectorStoreFromFiles(client, fileIds, vectorMetadata);

        if (vectorStoreResult.type === 'error') {
            return err(vectorStoreResult.error);
        }

        logger.info({
            message: "Created vector store from conversation files",
            conversationId,
            vectorStoreId: vectorStoreResult.data,
            fileCount: fileIds.length
        });

        return ok(vectorStoreResult.data);
    } catch (error) {
        logger.error({
            message: "Error creating vector store from conversation",
            error,
            conversationId
        });

        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
