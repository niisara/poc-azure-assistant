import express from 'express';
import { createLlmResponse } from './responses';
// import { createAssistantClient } from './llmAssistant';
// import { createLlmResponse } from './llmResponseOpenAI';
import { initLogger } from './logger';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getCsvFilesFromConversation } from './responses/getCsvFilesFromConversation';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const logger = initLogger();

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
// Ensure uploads directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename
    cb(null, file.originalname);
  }
});

// File filter to only accept CSV files
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'));
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Middleware to parse JSON bodies
app.use(express.json());

// Initialize LLM response service
let llmAssistantService: Awaited<ReturnType<typeof createLlmResponse>>;

async function initLlmService() {
  try {
    llmAssistantService = await createLlmResponse();
    logger.info({ message: "LLM service initialized successfully" });
  } catch (error) {
    logger.error({ message: "Failed to initialize LLM service", error });
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Service is running' });
});

// API endpoint to get LLM response
app.post('/api/llm/completion', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a "prompt" field'
      });
    }

    logger.info({ message: "Received completion request", promptLength: prompt.length });

    const response = await llmAssistantService.getLLMResponse(prompt);

    res.status(200).json({
      success: true,
      completion: response
    });
  } catch (error: any) {
    logger.error({ message: "Error processing LLM completion request", error });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// API endpoint to get all file IDs for a conversation
app.get('/api/files/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a conversationId parameter'
      });
    }

    logger.info({
      message: "Received request to get all file IDs",
      conversationId
    });

    const result = await llmAssistantService.uploadAllFilesFromConversation(conversationId);

    if (result.type === 'ok') {
      res.status(200).json({
        success: true,
        fileIds: result.data,
        count: result.data.length
      });
    } else {
      res.status(500).json({
        error: 'Error Getting File IDs',
        message: result.error.message
      });
    }
  } catch (error: any) {
    logger.error({
      message: "Error processing get file IDs request",
      error
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// API endpoint to use files with LLM
// API endpoint to use files with LLM (modified to accept fileIds directly)
app.post('/api/llm/completion-with-files', async (req, res) => {
  try {
    const { prompt, fileIds } = req.body;

    if (!prompt || !fileIds) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include "prompt" and "fileIds" fields'
      });
    }

    // Check if fileIds is provided as a string and parse it
    let parsedFileIds = fileIds;
    if (typeof fileIds === 'string') {
      try {
        // Handle both array notation [id1,id2] and comma-separated "id1,id2"
        if (fileIds.trim().startsWith('[') && fileIds.trim().endsWith(']')) {
          parsedFileIds = JSON.parse(fileIds);
        } else {
          parsedFileIds = fileIds.split(',').map(id => id.trim());
        }
      } catch (parseError) {
        return res.status(400).json({
          error: 'Invalid File IDs Format',
          message: 'The fileIds must be a valid array or comma-separated string'
        });
      }
    }

    logger.info({
      message: "Received completion with files request",
      fileIds: parsedFileIds,
      promptLength: prompt.length
    });

    // Use the file IDs directly with the LLM
    const response = await llmAssistantService.getLLMResponse(prompt, parsedFileIds);

    res.status(200).json({
      success: true,
      completion: response,
      filesUsed: parsedFileIds.length
    });
  } catch (error: any) {
    logger.error({
      message: "Error processing completion with files request",
      error
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// API endpoint to create a vector store from specific file IDs
app.post('/api/vector-store/create-from-files', async (req, res) => {
  try {
    const { fileIds, metadata } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a non-empty "fileIds" array'
      });
    }

    logger.info({
      message: "Received request to create vector store from files",
      fileCount: fileIds.length
    });

    const result = await llmAssistantService.createVectorStoreFromFiles(fileIds, metadata);

    if (result.type === 'ok') {
      res.status(200).json({
        success: true,
        vectorStoreId: result.data
      });
    } else {
      res.status(500).json({
        error: 'Error Creating Vector Store',
        message: result.error.message
      });
    }
  } catch (error: any) {
    logger.error({
      message: "Error processing create vector store request",
      error
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// API endpoint to create a vector store from all files in a conversation
app.post('/api/vector-store/create-from-conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { metadata } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a conversationId parameter'
      });
    }

    logger.info({
      message: "Received request to create vector store from conversation",
      conversationId
    });

    const result = await llmAssistantService.createVectorStoreFromConversation(conversationId, metadata);

    if (result.type === 'ok') {
      res.status(200).json({
        success: true,
        vectorStoreId: result.data,
        conversationId
      });
    } else {
      res.status(500).json({
        error: 'Error Creating Vector Store',
        message: result.error.message
      });
    }
  } catch (error: any) {
    logger.error({
      message: "Error processing create vector store from conversation request",
      error
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// API endpoint to get all vector stores for a conversation
app.get('/api/vector-store/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a conversationId parameter'
      });
    }

    logger.info({
      message: "Received request to get vector stores for conversation",
      conversationId
    });

    const result = await llmAssistantService.getVectorStoresForConversation(conversationId);

    if (result.type === 'ok') {
      res.status(200).json({
        success: true,
        vectorStoreIds: result.data,
        count: result.data.length,
        conversationId
      });
    } else {
      res.status(500).json({
        error: 'Error Getting Vector Stores',
        message: result.error.message
      });
    }
  } catch (error: any) {
    logger.error({
      message: "Error processing get vector stores request",
      error
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// API endpoint to create batched vector stores from specific file IDs
app.post('/api/vector-store/create-batched', async (req, res) => {
  try {
    const { fileIds, batchSize, metadata } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a non-empty "fileIds" array'
      });
    }

    const parsedBatchSize = batchSize ? parseInt(batchSize) : 20;
    
    if (isNaN(parsedBatchSize) || parsedBatchSize <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The "batchSize" must be a positive number'
      });
    }

    logger.info({
      message: "Received request to create batched vector stores",
      fileCount: fileIds.length,
      batchSize: parsedBatchSize
    });

    const result = await llmAssistantService.createBatchedVectorStores(fileIds, parsedBatchSize, metadata);

    if (result.type === 'ok') {
      res.status(200).json({
        success: true,
        vectorStoreIds: result.data,
        count: result.data.length,
        batchSize: parsedBatchSize,
        totalFiles: fileIds.length
      });
    } else {
      res.status(500).json({
        error: 'Error Creating Batched Vector Stores',
        message: result.error.message
      });
    }
  } catch (error: any) {
    logger.error({
      message: "Error processing create batched vector stores request",
      error
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// API endpoint to create batched vector stores from all files in a conversation
app.post('/api/vector-store/create-batched-from-conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { batchSize, metadata } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a conversationId parameter'
      });
    }

    const parsedBatchSize = batchSize ? parseInt(batchSize) : 20;
    
    if (isNaN(parsedBatchSize) || parsedBatchSize <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The "batchSize" must be a positive number'
      });
    }

    logger.info({
      message: "Received request to create batched vector stores from conversation",
      conversationId,
      batchSize: parsedBatchSize
    });

    const result = await llmAssistantService.createBatchedVectorStoresFromConversation(
      conversationId, 
      parsedBatchSize, 
      metadata
    );

    if (result.type === 'ok') {
      res.status(200).json({
        success: true,
        vectorStoreIds: result.data,
        count: result.data.length,
        batchSize: parsedBatchSize,
        conversationId
      });
    } else {
      res.status(500).json({
        error: 'Error Creating Batched Vector Stores',
        message: result.error.message
      });
    }
  } catch (error: any) {
    logger.error({
      message: "Error processing create batched vector stores from conversation request",
      error
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// API endpoint to use LLM with vector stores (file search)
app.post('/api/llm/completion-with-file-search', async (req, res) => {
  try {
    const { prompt, vectorStoreIds } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a "prompt" field'
      });
    }

    if (!vectorStoreIds || !Array.isArray(vectorStoreIds) || vectorStoreIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a non-empty "vectorStoreIds" array'
      });
    }

    // Ensure all vector store IDs have the "vs_" prefix
    const prefixedVectorStoreIds = vectorStoreIds.map(id => 
      id.startsWith('vs_') ? id : `vs_${id}`
    );

    logger.info({
      message: "Received completion with file search request",
      vectorStoreCount: prefixedVectorStoreIds.length,
      promptLength: prompt.length
    });

    // Use the vector store IDs with the LLM as file search IDs
    const response = await llmAssistantService.getLLMResponse(prompt, prefixedVectorStoreIds);

    res.status(200).json({
      success: true,
      completion: response,
      vectorStoresUsed: prefixedVectorStoreIds
    });
  } catch (error: any) {
    logger.error({
      message: "Error processing completion with file search request",
      error
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// API endpoint to get Python code response
app.post('/api/llm/python-code', async (req, res) => {
  try {
    const { prompt, conversationId } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Pass conversationId to getPythonCodeResponse
    const result = await llmAssistantService.getPythonCodeResponse(prompt, conversationId);
    res.json(result);
  } catch (error) {
    logger.error({ message: 'Error in /api/llm/python-code', error });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API endpoint to upload a CSV file
app.post('/api/upload/:conversationId', upload.single('file'), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const file = req.file;

    if (!conversationId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The request must include a conversationId parameter'
      });
    }

    if (!file) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No file uploaded or file is not a CSV'
      });
    }

    logger.info({
      message: "Received file upload request",
      conversationId,
      fileName: file.originalname,
      fileSize: file.size
    });

    // Call the createFile function to upload to Azure Blob Storage
    const result = await llmAssistantService.createFile(conversationId, file.originalname);

    if (result.type === 'ok') {
      res.status(200).json({
        success: true,
        filePath: result.data,
        conversationId,
        fileName: file.originalname
      });
    } else {
      res.status(500).json({
        error: 'Error Uploading File',
        message: result.error.message
      });
    }
  } catch (error: any) {
    logger.error({
      message: "Error processing file upload request",
      error
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// GET endpoint to test getCsvFilesFromConversation
app.get('/api/conversation/:conversationId/csv-files', async (req, res) => {
  const { conversationId } = req.params;
  try {
    if (!conversationId) {
      return res.status(400).json({ error: 'Missing conversationId parameter' });
    }
    const csvFiles = await getCsvFilesFromConversation(conversationId);
    res.json({ csvFiles });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Start server after initializing LLM service
async function startServer() {
  await initLlmService();

  app.listen(PORT, () => {
    logger.info({ message: `Server is running on port ${PORT}` });
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ message: 'Uncaught exception', error });
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  logger.error({ message: 'Unhandled rejection', reason });
});

// Start the server
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    logger.error({ message: 'Failed to start server', error });
    process.exit(1);
  });
}

// Export for testing
export default app;