#!/usr/bin/env node

const readline = require('readline');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

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

// Function to validate if a file exists
function validateFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`${colors.red}File not found: ${filePath}${colors.reset}`);
        return false;
    }
    
    // Check if the file is a CSV
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.csv') {
        console.log(`${colors.red}File must be a CSV file. Found: ${ext}${colors.reset}`);
        return false;
    }
    
    return true;
}

// Upload a file to the server
async function uploadFile(conversationId, filePath) {
    try {
        if (!validateFile(filePath)) {
            return;
        }
        
        console.log(`${colors.yellow}Uploading file...${colors.reset}`);
        
        // Create a form data object
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        
        // Make the request with form data
        const response = await axios.post(
            `${API_BASE_URL}/api/upload/${conversationId}`,
            formData,
            {
                headers: {
                    ...formData.getHeaders()
                }
            }
        );
        
        printResponse(response);
    } catch (error) {
        printError(error);
    }
}

// Function to list CSV files in a directory
function listCsvFiles(directoryPath) {
    try {
        if (!fs.existsSync(directoryPath)) {
            console.log(`${colors.red}Directory not found: ${directoryPath}${colors.reset}`);
            return [];
        }
        
        const files = fs.readdirSync(directoryPath);
        const csvFiles = files.filter(file => path.extname(file).toLowerCase() === '.csv');
        
        return csvFiles;
    } catch (error) {
        console.log(`${colors.red}Error listing files: ${error.message}${colors.reset}`);
        return [];
    }
}

// Show available CSV files
function showAvailableFiles() {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const csvFiles = listCsvFiles(uploadsDir);
    
    console.log(`${colors.green}\nAvailable CSV files in uploads directory:${colors.reset}`);
    
    if (csvFiles.length === 0) {
        console.log(`${colors.yellow}No CSV files found in ${uploadsDir}${colors.reset}`);
    } else {
        csvFiles.forEach((file, index) => {
            console.log(`${index + 1}. ${file}`);
        });
    }
    
    console.log();
}

// Function to get Python code from a prompt
async function getPythonCodeFromPrompt() {
    rl.question(`${colors.green}Enter your prompt for Python code: ${colors.reset}`, async (prompt) => {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/llm/python-code`,
                { prompt },
                { headers: { 'Content-Type': 'application/json' } }
            );
            printResponse(response);
        } catch (error) {
            printError(error);
        }
        showMainMenu();
    });
}

// Main menu
function showMainMenu() {
    console.log(`${colors.green}\n=== File Upload Testing CLI ===\n${colors.reset}`);
    console.log('1. Upload a CSV file');
    console.log('2. List available CSV files');
    console.log('3. Get Python code from prompt');
    console.log('0. Exit');
    
    rl.question(`${colors.green}\nSelect an option: ${colors.reset}`, (answer) => {
        switch (answer) {
            case '1':
                rl.question(`${colors.green}Enter conversation ID: ${colors.reset}`, (conversationId) => {
                    rl.question(`${colors.green}Enter file path (absolute path or relative to current directory): ${colors.reset}`, (filePath) => {
                        uploadFile(conversationId, filePath).then(() => showMainMenu());
                    });
                });
                break;
            case '2':
                showAvailableFiles();
                showMainMenu();
                break;
            case '3':
                getPythonCodeFromPrompt();
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
console.log(`${colors.blue}Starting File Upload Testing CLI${colors.reset}`);
console.log(`${colors.blue}API Base URL: ${API_BASE_URL}${colors.reset}`);
console.log(`${colors.blue}To change the base URL, set the API_BASE_URL environment variable\n${colors.reset}`);

showMainMenu();
