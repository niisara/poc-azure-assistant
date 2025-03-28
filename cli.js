#!/usr/bin/env node

const readline = require('readline');
const axios = require('axios');

// Configure API base URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Helper to print responses
function printResponse(response) {
    console.log(`${colors.cyan}\nResponse:${colors.reset}`);
    console.log(`${colors.cyan}Status:${colors.reset}`, response.status);
    console.log(`${colors.cyan}Data:${colors.reset}`);
    console.log(JSON.stringify(response.data, null, 2));
    console.log();
}

// Helper to print errors
function printError(error) {
    console.log(`${colors.red}\nError:${colors.reset}`);
    if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.log(`${colors.red}Status:${colors.reset}`, error.response.status);
        console.log(`${colors.red}Data:${colors.reset}`);
        console.log(JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
        // The request was made but no response was received
        console.log(`${colors.red}No response received from server${colors.reset}`);
    } else {
        // Something happened in setting up the request that triggered an Error
        console.log(`${colors.red}Error message:${colors.reset}`, error.message);
    }
    console.log();
}

// Parse array input from string
function parseArrayInput(input) {
    if (typeof input !== 'string') return input;
    
    input = input.trim();
    
    // Try to parse as JSON if it looks like an array
    if (input.startsWith('[') && input.endsWith(']')) {
        try {
            return JSON.parse(input);
        } catch (e) {
            // If parsing fails, fall back to comma separation
            return input.slice(1, -1).split(',').map(item => item.trim());
        }
    }
    
    // Otherwise, split by commas
    return input.split(',').map(item => item.trim());
}

// Parse metadata input
function parseMetadata(input) {
    if (!input || input.trim() === '') return {};
    
    try {
        return JSON.parse(input);
    } catch (e) {
        console.log(`${colors.red}Warning: Invalid JSON for metadata. Using empty object.${colors.reset}`);
        return {};
    }
}

// Functions to call different API endpoints
async function healthCheck() {
    try {
        console.log(`${colors.yellow}Checking API health...${colors.reset}`);
        const response = await axios.get(`${API_BASE_URL}/health`);
        printResponse(response);
    } catch (error) {
        printError(error);
    }
}

async function createVectorStoreFromFiles() {
    try {
        rl.question(`${colors.green}Enter file IDs (comma-separated or as array [id1,id2]): ${colors.reset}`, async (fileIdsInput) => {
            rl.question(`${colors.green}Enter metadata (as JSON object, or leave empty): ${colors.reset}`, async (metadataInput) => {
                const fileIds = parseArrayInput(fileIdsInput);
                const metadata = parseMetadata(metadataInput);
                
                console.log(`${colors.yellow}Creating vector store from files...${colors.reset}`);
                
                try {
                    const response = await axios.post(`${API_BASE_URL}/api/vector-store/create-from-files`, {
                        fileIds,
                        metadata
                    });
                    printResponse(response);
                } catch (error) {
                    printError(error);
                }
                
                showVectorStoreMenu();
            });
        });
    } catch (error) {
        printError(error);
        showVectorStoreMenu();
    }
}

async function createVectorStoreFromConversation() {
    try {
        rl.question(`${colors.green}Enter conversation ID: ${colors.reset}`, async (conversationId) => {
            rl.question(`${colors.green}Enter metadata (as JSON object, or leave empty): ${colors.reset}`, async (metadataInput) => {
                const metadata = parseMetadata(metadataInput);
                
                console.log(`${colors.yellow}Creating vector store from conversation...${colors.reset}`);
                
                try {
                    const response = await axios.post(
                        `${API_BASE_URL}/api/vector-store/create-from-conversation/${conversationId}`,
                        { metadata }
                    );
                    printResponse(response);
                } catch (error) {
                    printError(error);
                }
                
                showVectorStoreMenu();
            });
        });
    } catch (error) {
        printError(error);
        showVectorStoreMenu();
    }
}

async function getVectorStoresForConversation() {
    try {
        rl.question(`${colors.green}Enter conversation ID: ${colors.reset}`, async (conversationId) => {
            console.log(`${colors.yellow}Getting vector stores for conversation...${colors.reset}`);
            
            try {
                const response = await axios.get(
                    `${API_BASE_URL}/api/vector-store/conversation/${conversationId}`
                );
                printResponse(response);
            } catch (error) {
                printError(error);
            }
            
            showVectorStoreMenu();
        });
    } catch (error) {
        printError(error);
        showVectorStoreMenu();
    }
}

async function createBatchedVectorStores() {
    try {
        rl.question(`${colors.green}Enter file IDs (comma-separated or as array [id1,id2]): ${colors.reset}`, async (fileIdsInput) => {
            rl.question(`${colors.green}Enter batch size (default 20): ${colors.reset}`, async (batchSizeInput) => {
                rl.question(`${colors.green}Enter metadata (as JSON object, or leave empty): ${colors.reset}`, async (metadataInput) => {
                    const fileIds = parseArrayInput(fileIdsInput);
                    const batchSize = batchSizeInput ? parseInt(batchSizeInput) : 20;
                    const metadata = parseMetadata(metadataInput);
                    
                    console.log(`${colors.yellow}Creating batched vector stores...${colors.reset}`);
                    
                    try {
                        const response = await axios.post(`${API_BASE_URL}/api/vector-store/create-batched`, {
                            fileIds,
                            batchSize,
                            metadata
                        });
                        printResponse(response);
                    } catch (error) {
                        printError(error);
                    }
                    
                    showVectorStoreMenu();
                });
            });
        });
    } catch (error) {
        printError(error);
        showVectorStoreMenu();
    }
}

async function createBatchedVectorStoresFromConversation() {
    try {
        rl.question(`${colors.green}Enter conversation ID: ${colors.reset}`, async (conversationId) => {
            rl.question(`${colors.green}Enter batch size (default 20): ${colors.reset}`, async (batchSizeInput) => {
                rl.question(`${colors.green}Enter metadata (as JSON object, or leave empty): ${colors.reset}`, async (metadataInput) => {
                    const batchSize = batchSizeInput ? parseInt(batchSizeInput) : 20;
                    const metadata = parseMetadata(metadataInput);
                    
                    console.log(`${colors.yellow}Creating batched vector stores from conversation...${colors.reset}`);
                    
                    try {
                        const response = await axios.post(
                            `${API_BASE_URL}/api/vector-store/create-batched-from-conversation/${conversationId}`,
                            { batchSize, metadata }
                        );
                        printResponse(response);
                    } catch (error) {
                        printError(error);
                    }
                    
                    showVectorStoreMenu();
                });
            });
        });
    } catch (error) {
        printError(error);
        showVectorStoreMenu();
    }
}

async function completionWithFileSearch() {
    try {
        rl.question(`${colors.green}Enter prompt: ${colors.reset}`, async (prompt) => {
            rl.question(`${colors.green}Enter vector store IDs (comma-separated or as array [id1,id2]): ${colors.reset}`, async (vectorStoreIdsInput) => {
                const vectorStoreIds = parseArrayInput(vectorStoreIdsInput);
                
                console.log(`${colors.yellow}Sending completion with file search request...${colors.reset}`);
                
                try {
                    const response = await axios.post(`${API_BASE_URL}/api/llm/completion-with-file-search`, {
                        prompt,
                        vectorStoreIds
                    });
                    printResponse(response);
                } catch (error) {
                    printError(error);
                }
                
                showVectorStoreMenu();
            });
        });
    } catch (error) {
        printError(error);
        showVectorStoreMenu();
    }
}

// Vector Store menu
function showVectorStoreMenu() {
    console.log(`${colors.magenta}\n=== Vector Store Menu ===\n${colors.reset}`);
    console.log('1. Create Vector Store from Files');
    console.log('2. Create Vector Store from Conversation');
    console.log('3. Get Vector Stores for Conversation');
    console.log('4. Create Batched Vector Stores');
    console.log('5. Create Batched Vector Stores from Conversation');
    console.log('6. Completion with File Search');
    console.log('7. Health Check');
    console.log('0. Back to Main Menu');

    rl.question(`${colors.magenta}\nSelect an option: ${colors.reset}`, (answer) => {
        switch (answer) {
            case '1':
                createVectorStoreFromFiles();
                break;
            case '2':
                createVectorStoreFromConversation();
                break;
            case '3':
                getVectorStoresForConversation();
                break;
            case '4':
                createBatchedVectorStores();
                break;
            case '5':
                createBatchedVectorStoresFromConversation();
                break;
            case '6':
                completionWithFileSearch();
                break;
            case '7':
                healthCheck().then(() => showVectorStoreMenu());
                break;
            case '0':
                showMainMenu();
                break;
            default:
                console.log(`${colors.red}Invalid option. Please try again.${colors.reset}`);
                showVectorStoreMenu();
        }
    });
}

// Functions for the original menu items
async function getLlmCompletion(prompt) {
    try {
        console.log(`${colors.yellow}Sending LLM completion request...${colors.reset}`);
        const response = await axios.post(`${API_BASE_URL}/api/llm/completion`, {
            prompt
        });
        printResponse(response);
    } catch (error) {
        printError(error);
    }
}

async function uploadFile(conversationId, fileName) {
    try {
        console.log(`${colors.yellow}Uploading file...${colors.reset}`);
        const response = await axios.post(`${API_BASE_URL}/api/files/upload`, {
            conversationId,
            fileName
        });
        printResponse(response);
    } catch (error) {
        printError(error);
    }
}

async function getAllFileIds(conversationId) {
    try {
        console.log(`${colors.yellow}Getting all file IDs...${colors.reset}`);
        const response = await axios.get(`${API_BASE_URL}/api/files/${conversationId}`);
        printResponse(response);
    } catch (error) {
        printError(error);
    }
}

async function completionWithFiles(prompt, fileIds) {
    try {
        console.log(`${colors.yellow}Sending completion with files request...${colors.reset}`);
        const response = await axios.post(`${API_BASE_URL}/api/llm/completion-with-files`, {
            prompt,
            fileIds
        });
        printResponse(response);
    } catch (error) {
        printError(error);
    }
}

// Main menu
function showMainMenu() {
    console.log(`${colors.green}\n=== API Testing CLI ===\n${colors.reset}`);
    console.log('1. Health Check');
    console.log('2. LLM Completion');
    console.log('3. Upload File');
    console.log('4. Get All File IDs');
    console.log('5. Completion with Files');
    console.log('6. Vector Store Operations');
    console.log('0. Exit');

    rl.question(`${colors.green}\nSelect an option: ${colors.reset}`, (answer) => {
        switch (answer) {
            case '1':
                healthCheck().then(() => showMainMenu());
                break;
            case '2':
                rl.question(`${colors.green}Enter prompt: ${colors.reset}`, (prompt) => {
                    getLlmCompletion(prompt).then(() => showMainMenu());
                });
                break;
            case '3':
                rl.question(`${colors.green}Enter conversation ID: ${colors.reset}`, (conversationId) => {
                    rl.question(`${colors.green}Enter file name: ${colors.reset}`, (fileName) => {
                        uploadFile(conversationId, fileName).then(() => showMainMenu());
                    });
                });
                break;
            case '4':
                rl.question(`${colors.green}Enter conversation ID: ${colors.reset}`, (conversationId) => {
                    getAllFileIds(conversationId).then(() => showMainMenu());
                });
                break;
            case '5':
                rl.question(`${colors.green}Enter prompt: ${colors.reset}`, (prompt) => {
                    rl.question(`${colors.green}Enter file IDs (comma-separated or as array [id1,id2]): ${colors.reset}`, (fileIds) => {
                        completionWithFiles(prompt, fileIds).then(() => showMainMenu());
                    });
                });
                break;
            case '6':
                showVectorStoreMenu();
                break;
            case '0':
                console.log(`${colors.green}Exiting...${colors.reset}`);
                rl.close();
                break;
            default:
                console.log(`${colors.red}Invalid option. Please try again.${colors.reset}`);
                showMainMenu();
        }
    });
}

// Start the CLI
console.log(`${colors.blue}Starting API Testing CLI${colors.reset}`);
console.log(`${colors.blue}API Base URL: ${API_BASE_URL}${colors.reset}`);
console.log(`${colors.blue}To change the base URL, set the API_BASE_URL environment variable\n${colors.reset}`);

showMainMenu();