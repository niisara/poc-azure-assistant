import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";

export interface CsvFileInfo {
    name: string;
    metadata: Record<string, any>;
}

/**
 * Returns all CSV files and their metadata for a given conversation from Azure Blob Storage.
 */
export async function getCsvFilesFromConversation(conversationId: string): Promise<CsvFileInfo[]> {
    const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const storageAccountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "conversations";
    const csvFiles: CsvFileInfo[] = [];

    if (!storageAccountName || !storageAccountKey) {
        throw new Error("Missing Azure Storage credentials in environment variables");
    }

    const sharedKeyCredential = new StorageSharedKeyCredential(
        storageAccountName,
        storageAccountKey
    );
    const blobServiceClient = new BlobServiceClient(
        `https://${storageAccountName}.blob.core.windows.net`,
        sharedKeyCredential
    );
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const prefix = `${conversationId}/`;

    for await (const blob of containerClient.listBlobsFlat({ prefix, includeMetadata: true })) {
        const fileName = blob.name.replace(prefix, '');
        if (fileName && fileName.endsWith('.csv')) {
            csvFiles.push({
                name: fileName,
                metadata: blob.metadata || {}
            });
        }
    }
    return csvFiles;
}
