import { AzureOpenAI } from "openai";
import { initLogger } from '../logger';
import { Result, ok, err } from './utils/result';
import { uploadAllFilesFromConversation } from './uploadAllFilesFromConversation';
import { createBatchedVectorStores } from './createBatchedVectorStores';

const logger = initLogger();

/**
 * Creates batched vector stores from a conversation's files.
 * @param client - The OpenAI client instance
 * @param conversationId - The ID of the conversation.
 * @param batchSize - Number of files per vector store batch.
 * @param metadata - Optional base metadata for all vector stores.
 * @returns A Result containing an array of vector store IDs if successful, or an error if failed.
 */
export async function createBatchedVectorStoresFromConversation(
    client: AzureOpenAI,
    conversationId: string,
    batchSize: number = 20,
    metadata?: Record<string, any>
): Promise<Result<string[], Error>> {
    try {
        // First, upload all files from the conversation
        const uploadResult = await uploadAllFilesFromConversation(client, conversationId);

        if (uploadResult.type === 'error') {
            return err(uploadResult.error);
        }

        const fileIds = uploadResult.data;

        if (fileIds.length === 0) {
            logger.info({
                message: "No files found in conversation to create batched vector stores",
                conversationId
            });
            return ok([]);
        }

        // Create base metadata with conversation ID if not provided
        const vectorMetadata = {
            ...(metadata || {}),
            conversationId,
            createdAt: new Date().toISOString()
        };

        // Create batched vector stores from the uploaded files
        const result = await createBatchedVectorStores(client, fileIds, batchSize, vectorMetadata);

        if (result.type === 'error') {
            return err(result.error);
        }

        logger.info({
            message: "Created batched vector stores from conversation files",
            conversationId,
            vectorStoreCount: result.data.length,
            fileCount: fileIds.length
        });

        return ok(result.data);
    } catch (error) {
        logger.error({
            message: "Error creating batched vector stores from conversation",
            error,
            conversationId
        });

        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
