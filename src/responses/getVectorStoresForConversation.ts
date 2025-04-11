import { AzureOpenAI } from "openai";
import { initLogger } from '../logger';
import { Result, ok, err } from './utils/result';

const logger = initLogger();

/**
 * Retrieves all vector stores associated with a particular conversation.
 * @param client - The OpenAI client instance
 * @param conversationId - The ID of the conversation.
 * @returns A Result containing an array of vector store IDs if successful, or an error if failed.
 */
export async function getVectorStoresForConversation(
    client: AzureOpenAI,
    conversationId: string
): Promise<Result<string[], Error>> {
    try {
        logger.info({
            message: "Retrieving vector stores for conversation",
            conversationId
        });

        // List all vector stores
        const response = await client.vectorStores.list({
            // Note: Unfortunately the OpenAI API doesn't support filtering
            // directly at the API level, so we'll filter on the client side
            limit: 100 // Adjust as needed
        });

        // Filter for vector stores with matching conversationId in metadata
        const conversationVectorStores = response.data.filter(
            store => store.metadata &&
                typeof store.metadata === 'object' &&
                'conversationId' in store.metadata &&
                store.metadata.conversationId === conversationId
        );

        const vectorStoreIds = conversationVectorStores.map(store => store.id);

        logger.info({
            message: "Retrieved vector stores for conversation",
            conversationId,
            vectorStoreCount: vectorStoreIds.length
        });

        return ok(vectorStoreIds);
    } catch (error) {
        logger.error({
            message: "Error retrieving vector stores for conversation",
            error,
            conversationId
        });

        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
