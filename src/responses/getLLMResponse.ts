import { AzureOpenAI } from "openai";
import { ResponseCreateParamsNonStreaming, ResponseInputContent, ResponseInputItem } from "openai/resources/responses/responses";
import { initLogger } from '../logger';
import axios from "axios";
import { getCsvFilesFromConversation } from './getCsvFilesFromConversation';

const logger = initLogger();

/**
 * Sends a prompt to OpenAI using the responses API.
 * @param client - The OpenAI client instance
 * @param deploymentName - The deployment name to use
 * @param prompt - The text prompt for which to generate a response.
 * @param fileIds - Optional array of file IDs. IDs prefixed with "vs_" will be treated as file search IDs.
 * @returns The generated response as a string.
 */
export async function getLLMResponse(
    client: AzureOpenAI,
    deploymentName: string,
    prompt: string,
    fileIds?: string[]
): Promise<string> {
    try {
        // Separate regular file IDs from file search IDs (prefixed with vs_)
        const regularFileIds = fileIds?.filter(id => !id.startsWith("vs_")) || [];
        const fileSearchIds = fileIds?.filter(id => id.startsWith("vs_")) || [];

        logger.info({
            message: "Sending response request to OpenAI",
            model: deploymentName,
            regularFileIdsCount: regularFileIds.length,
            fileSearchIdsCount: fileSearchIds.length
        });

        // Create a strongly typed request options object
        let requestOptions: ResponseCreateParamsNonStreaming = {
            input: prompt,
            model: deploymentName,
            stream: false
        };

        // Handle regular file IDs
        if (regularFileIds.length > 0) {
            // Create content array with text prompt
            const content: ResponseInputContent[] = [{ type: "input_text", text: prompt }];

            // Add all file IDs in a single input_file entry
            if (regularFileIds.length > 0) {
                content.push({
                    type: "input_file",
                    file_id: regularFileIds[0] // Note: OpenAI API expects a single file_id, not an array
                });

                // If there are multiple files, add them as separate entries
                if (regularFileIds.length > 1) {
                    for (let i = 1; i < regularFileIds.length; i++) {
                        content.push({
                            type: "input_file",
                            file_id: regularFileIds[i]
                        });
                    }
                }
            }

            const inputItems: ResponseInputItem[] = [
                {
                    role: "user",
                    content
                }
            ];

            requestOptions.input = inputItems;
        } else {
            // Default case with just prompt
            requestOptions.input = prompt;
        }

        // Handle file search IDs
        if (fileSearchIds.length > 0) {
            requestOptions.tools = [{
                type: "file_search",
                vector_store_ids: fileSearchIds,
            }];
        }

        console.log('-------')
        // @ts-ignore
        console.log(JSON.stringify(requestOptions.input[0]?.content, null, 2));
        // Use the responses API
        const response = await client.responses.create(requestOptions);

        if (response.output_text && response.output_text.length > 0) {
            const responseText = response.output_text;
            logger.info({
                message: "Received response from OpenAI",
                model: deploymentName,
                usage: response.usage
            });
            return responseText ?? "";
        } else {
            logger.error({ message: "No response text found in OpenAI response" });
            throw new Error("No response text found in OpenAI response");
        }
    } catch (error) {
        logger.error({
            message: "Error getting response from OpenAI",
            error,
            fileIdsProvided: !!fileIds && fileIds.length > 0
        });
        throw error;
    }
}

/**
 * Sends a prompt to OpenAI and returns ONLY Python code (no explanations, no markdown).
 * @param client - The OpenAI client instance
 * @param deploymentName - The deployment name to use
 * @param prompt - The text prompt for which to generate Python code.
 * @param conversationId - Optional conversation ID to fetch CSV files from.
 * @returns The generated Python code as a string.
 */
export async function getPythonCodeResponse(
    client: AzureOpenAI,
    deploymentName: string,
    prompt: string,
    conversationId?: string
): Promise<{ result: any, error: string | null }> {
    // Log CSV file info if conversationId is provided
    logger.info('--------------------'+(conversationId ?? ""));
    let csvMetadata = null;
    let csvFileName = "";
    
    if (conversationId) {
        try {
            const csvFiles = await getCsvFilesFromConversation(conversationId);
            if (csvFiles.length > 0) {
                csvFileName = csvFiles[0].name;
                csvMetadata = csvFiles[0].metadata;
                
                logger.info({
                    message: 'CSV file info',
                    fileName: csvFileName,
                    metadata: csvMetadata
                });
            }
        } catch (csvErr) {
            logger.error({ message: 'Failed to get CSV files from conversation', error: csvErr, conversationId });
        }
    }
    logger.info('--------------------');
    
    // Build a more instructive prompt that includes CSV metadata if available
    let codeOnlyPrompt = "";
    
    if (csvMetadata && csvFileName) {
        // Format the metadata to be more usable
        const metadataStr = JSON.stringify({
            message: "CSV file info",
            fileName: csvFileName,
            metadata: csvMetadata
        }, null, 2);
        
        codeOnlyPrompt = `I have a CSV file with the following metadata:
${metadataStr}

User query: "${prompt.trim()}"

Based on this metadata and query, generate Python code to analyze the CSV file and return the requested information.
Use pandas to read the CSV file at './uploads/${csvFileName}' and perform the necessary operations.
Respond ONLY with valid Python code. Do not include any explanation, markdown, or extra text.
At the end of your code, assign the main result to a variable named 'result' (e.g., result = ...).
If you want to show intermediate steps, you may use print statements, but the final answer must be assigned to 'result'.`;
    } else {
        // Fallback to the original prompt if no CSV metadata is available
        codeOnlyPrompt = `${prompt.trim()}
\nRespond ONLY with valid Python code. Do not include any explanation, markdown, or extra text.\nAt the end of your code, assign the main result to a variable named 'result' (e.g., result = ...). If you want to show intermediate steps, you may use print statements, but the final answer must be assigned to 'result'.\n`;
    }
    
    try {
        logger.info({
            message: "Sending Python code response request to OpenAI",
            model: deploymentName
        });

        let requestOptions: ResponseCreateParamsNonStreaming = {
            input: codeOnlyPrompt,
            model: deploymentName,
            stream: false
        };

        // @ts-ignore
        console.log("[getPythonCodeResponse]", JSON.stringify(requestOptions.input, null, 2));
        const response = await client.responses.create(requestOptions);
        if (response.output_text && response.output_text.length > 0) {
            const pythonCodeRaw = response.output_text;
            // Remove markdown code fences if present
            const pythonCode = pythonCodeRaw.replace(/^```(?:python)?\s*|```$/gim, '').trim();
            // logger.info('--------------------');
            // logger.info(pythonCode);
            // logger.info('--------------------');

            // Execute the Python code using the local executor API
            try {
                const execResponse = await axios.post(
                    "http://127.0.0.1:5001/api/execute",
                    { code: pythonCode },
                    { headers: { "Content-Type": "application/json" } }
                );
                console.log("[getPythonCodeResponse]", JSON.stringify(execResponse.data, null, 2));
                if (execResponse.data && typeof execResponse.data === 'object') {
                    const result = execResponse.data.result ?? null;
                    // Prefer error, but if not present, use stderr if it's non-empty
                    let error = execResponse.data.error;
                    if (!error && execResponse.data.stderr && execResponse.data.stderr.trim().length > 0) {
                        error = execResponse.data.stderr;
                    }
                    return { result, error };
                }
            } catch (execError) {
                // If the executor API call itself fails
                return { result: null, error: execError instanceof Error ? execError.message : String(execError) };
            }
        } else {
            logger.error({ message: "No Python code found in OpenAI response" });
            throw new Error("No Python code found in OpenAI response");
        }
        // If we reach here, no valid result was returned in any path
        return { result: null, error: "No code generated or unexpected response from LLM." };
    } catch (error) {
        logger.error({
            message: "Error getting Python code from OpenAI",
            error
        });
        throw error;
    }
}
