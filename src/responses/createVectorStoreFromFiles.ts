import { AzureOpenAI } from "openai";
import { initLogger } from '../logger';
import { Result, ok, err } from './utils/result';

const logger = initLogger();

/**
 * Creates a vector store from files in OpenAI for search purposes.
 * @param client - The OpenAI client instance
 * @param fileIds - Array of file IDs to include in the vector store.
 * @param metadata - Optional metadata for the vector store.
 * @returns A Result containing the vector store ID if successful, or an error if failed.
 */
export async function createVectorStoreFromFiles(
    client: AzureOpenAI,
    fileIds: string[],
    metadata?: Record<string, any>
): Promise<Result<string, Error>> {
    try {
        if (!fileIds || fileIds.length === 0) {
            logger.error({ message: "No file IDs provided for vector store creation" });
            return err(new Error("No file IDs provided for vector store creation"));
        }

        logger.info({
            message: "Creating vector store from files",
            fileCount: fileIds.length
        });

        // Create the vector store using OpenAI API
        const response = await client.vectorStores.create({
            file_ids: fileIds,
            metadata: metadata || {},
            name: `VectorStore-${new Date().toISOString()}`,
        });

        logger.info({
            message: "Vector store created successfully",
            vectorStoreId: response.id
        });

        return ok(response.id);
    } catch (error) {
        logger.error({
            message: "Error creating vector store",
            error,
            fileIdsCount: fileIds.length
        });

        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
