// src/server.ts
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