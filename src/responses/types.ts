import { Result } from './utils/result';

export interface LlmResponse {
    getLLMResponse: (prompt: string, fileIds?: string[]) => Promise<string>;
    getPythonCodeResponse: (prompt: string) => Promise<{ result: any, error: string | null }>;
    uploadFileFromStorage: (conversationId: string, fileName: string) => Promise<Result<string, Error>>;
    uploadAllFilesFromConversation: (conversationId: string) => Promise<Result<string[], Error>>;
    createVectorStoreFromFiles: (fileIds: string[], metadata?: Record<string, any>) => Promise<Result<string, Error>>;
    createVectorStoreFromConversation: (conversationId: string, metadata?: Record<string, any>) => Promise<Result<string, Error>>;
    getVectorStoresForConversation: (conversationId: string) => Promise<Result<string[], Error>>;
    createBatchedVectorStores: (fileIds: string[], batchSize?: number, metadata?: Record<string, any>) => Promise<Result<string[], Error>>;
    createBatchedVectorStoresFromConversation: (conversationId: string, batchSize?: number, metadata?: Record<string, any>) => Promise<Result<string[], Error>>;
    createFile: (conversationId: string, filename: string) => Promise<Result<string, Error>>;
}
