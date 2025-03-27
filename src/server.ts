import express from 'express';
import { createLlmResponse } from './llmResponse';
// import { createAssistantClient } from './llmAssistant';
// import { createLlmResponse } from './llmResponseOpenAI';
import { initLogger } from './logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const logger = initLogger();

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