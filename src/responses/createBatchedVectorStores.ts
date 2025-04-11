import { AzureOpenAI } from "openai";
import { initLogger } from '../logger';
import { Result, ok, err } from './utils/result';
import { createVectorStoreFromFiles } from './createVectorStoreFromFiles';

const logger = initLogger();

/**
 * Batch process files by chunking them into groups for vector store creation
 * This is useful for large conversations with many files that need to be broken
 * into smaller vector stores for performance or size limitations.
 * @param client - The OpenAI client instance
 * @param fileIds - Array of file IDs to process.
 * @param batchSize - Number of files per vector store batch.
 * @param metadata - Optional base metadata for all vector stores.
 * @returns A Result containing an array of vector store IDs if successful, or an error if failed.
 */
export async function createBatchedVectorStores(
    client: AzureOpenAI,
    fileIds: string[],
    batchSize: number = 20,
    metadata?: Record<string, any>
): Promise<Result<string[], Error>> {
    try {
        if (!fileIds || fileIds.length === 0) {
            logger.error({ message: "No file IDs provided for batched vector store creation" });
            return err(new Error("No file IDs provided for batched vector store creation"));
        }

        logger.info({
            message: "Creating batched vector stores",
            totalFileCount: fileIds.length,
            batchSize
        });

        const vectorStoreIds: string[] = [];
        const batches: string[][] = [];

        // Split files into batches
        for (let i = 0; i < fileIds.length; i += batchSize) {
            batches.push(fileIds.slice(i, i + batchSize));
        }

        // Create vector store for each batch
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const batchMetadata = {
                ...metadata,
                batchNumber: i + 1,
                totalBatches: batches.length,
                batchSize: batch.length
            };

            const result = await createVectorStoreFromFiles(client, batch, batchMetadata);

            if (result.type === 'error') {
                logger.error({
                    message: "Error creating vector store for batch",
                    error: result.error,
                    batchNumber: i + 1,
                    batchSize: batch.length
                });
                // Continue with other batches despite error
                continue;
            }

            vectorStoreIds.push(result.data);
        }

        logger.info({
            message: "Completed batched vector store creation",
            vectorStoreCount: vectorStoreIds.length,
            totalBatches: batches.length
        });

        return ok(vectorStoreIds);
    } catch (error) {
        logger.error({
            message: "Error in batched vector store creation",
            error,
            fileIdsCount: fileIds.length
        });

        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
