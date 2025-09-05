#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { z } from "zod";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config();

// Validation schemas
const ChatRequestSchema = z.object({
  model: z.string().describe("OpenRouter model ID (e.g., 'openai/gpt-4')"),
  message: z.string().describe("Message to send to the model"),
  max_tokens: z.number().optional().default(1000).describe("Maximum tokens in response"),
  temperature: z.number().optional().default(0.7).describe("Temperature for response randomness"),
  system_prompt: z.string().optional().describe("System prompt for the conversation"),
});

const CompareModelsSchema = z.object({
  models: z.array(z.string()).describe("Array of model IDs to compare"),
  message: z.string().describe("Message to send to all models"),
  max_tokens: z.number().optional().default(500).describe("Maximum tokens per response"),
});

const GenerateImageSchema = z.object({
  model: z.string().describe("OpenRouter model ID that can output images"),
  message: z.string().describe("Prompt/message that elicits an image output"),
  savefile: z.string().optional().describe("File path or directory to save image (default: ./images)"),
});

// OpenRouter API configuration
const OPENROUTER_CONFIG = {
  baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_APP_NAME || "OpenRouter MCP Server",
    "Content-Type": "application/json",
  },
};

// Check if API key is available
if (!OPENROUTER_CONFIG.apiKey) {
  console.error("WARNING: OPENROUTER_API_KEY environment variable is not set!");
  console.error("Please set OPENROUTER_API_KEY to use the OpenRouter MCP server.");
}

class OpenRouterMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "openrouter-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupErrorHandling();
    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupResourceHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "openrouter://models",
            name: "Available Models",
            description: "List of all available OpenRouter models with pricing",
            mimeType: "application/json",
          },
          {
            uri: "openrouter://pricing",
            name: "Model Pricing",
            description: "Current pricing information for all models",
            mimeType: "application/json",
          },
          {
            uri: "openrouter://usage",
            name: "Usage Statistics",
            description: "Your OpenRouter usage statistics",
            mimeType: "application/json",
          },
        ],
      };
    });

    // Handle resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        switch (uri) {
          case "openrouter://models":
            return await this.getModelsResource();
          case "openrouter://pricing":
            return await this.getPricingResource();
          case "openrouter://usage":
            return await this.getUsageResource();
          default:
            throw new Error(`Unknown resource: ${uri}`);
        }
      } catch (error) {
        throw new Error(`Failed to read resource ${uri}: ${error}`);
      }
    });
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "list_models",
            description: "Get list of available OpenRouter models",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "chat_with_model",
            description: "Send a message to a specific OpenRouter model",
            inputSchema: {
              type: "object",
              properties: {
                model: {
                  type: "string",
                  description: "OpenRouter model ID (e.g., 'openai/gpt-4')",
                },
                message: {
                  type: "string",
                  description: "Message to send to the model",
                },
                max_tokens: {
                  type: "number",
                  description: "Maximum tokens in response",
                  default: 1000,
                },
                temperature: {
                  type: "number",
                  description: "Temperature for response randomness",
                  default: 0.7,
                },
                system_prompt: {
                  type: "string",
                  description: "System prompt for the conversation",
                },
              },
              required: ["model", "message"],
            },
          },
          {
            name: "compare_models",
            description: "Compare responses from multiple models",
            inputSchema: {
              type: "object",
              properties: {
                models: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: "Array of model IDs to compare",
                },
                message: {
                  type: "string",
                  description: "Message to send to all models",
                },
                max_tokens: {
                  type: "number",
                  description: "Maximum tokens per response",
                  default: 500,
                },
              },
              required: ["models", "message"],
            },
          },
          {
            name: "get_model_info",
            description: "Get detailed information about a specific model",
            inputSchema: {
              type: "object",
              properties: {
                model: {
                  type: "string",
                  description: "Model ID to get information about",
                },
              },
              required: ["model"],
            },
          },
          {
            name: "generate_image",
            description: "Generate or extract image from a multimodal model response and save to disk",
            inputSchema: {
              type: "object",
              properties: {
                model: {
                  type: "string",
                  description: "OpenRouter model ID that can output images",
                },
                message: {
                  type: "string",
                  description: "Prompt/message that elicits an image output",
                },
                savefile: {
                  type: "string",
                  description: "File path or directory to save image (default: ./images)",
                },
              },
              required: ["model", "message"],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "list_models":
            return await this.listModels();
          case "chat_with_model":
            return await this.chatWithModel(ChatRequestSchema.parse(args));
          case "compare_models":
            return await this.compareModels(CompareModelsSchema.parse(args));
          case "get_model_info":
            return await this.getModelInfo(args as { model: string });
          case "generate_image":
            return await this.generateImage(GenerateImageSchema.parse(args));
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Tool ${name} error:`, error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  // Resource handlers
  private async getModelsResource() {
    const response = await axios.get(`${OPENROUTER_CONFIG.baseURL}/models`, {
      headers: OPENROUTER_CONFIG.headers,
    });

    return {
      contents: [
        {
          type: "text" as const,
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }

  private async getPricingResource() {
    const response = await axios.get(`${OPENROUTER_CONFIG.baseURL}/models`, {
      headers: OPENROUTER_CONFIG.headers,
    });

    const pricing = response.data.data.map((model: any) => ({
      id: model.id,
      name: model.name,
      pricing: model.pricing,
    }));

    return {
      contents: [
        {
          type: "text" as const,
          text: JSON.stringify(pricing, null, 2),
        },
      ],
    };
  }

  private async getUsageResource() {
    // OpenRouter doesn't have a direct usage endpoint, so we'll return a placeholder
    const usage = {
      message: "Usage statistics would be available here",
      note: "OpenRouter doesn't provide a direct usage API endpoint",
    };

    return {
      contents: [
        {
          type: "text" as const,
          text: JSON.stringify(usage, null, 2),
        },
      ],
    };
  }

  // Tool handlers
  private async listModels() {
    const response = await axios.get(`${OPENROUTER_CONFIG.baseURL}/models`, {
      headers: OPENROUTER_CONFIG.headers,
    });

    const models = response.data.data.map((model: any) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      context_length: model.context_length,
      pricing: model.pricing,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${models.length} available models:\n\n${JSON.stringify(models, null, 2)}`,
        },
      ],
    };
  }

  private async chatWithModel(params: z.infer<typeof ChatRequestSchema>) {
    const { model, message, max_tokens, temperature, system_prompt } = params;

    const messages = [];
    if (system_prompt) {
      messages.push({ role: "system", content: system_prompt });
    }
    messages.push({ role: "user", content: message });

    const response = await axios.post(
      `${OPENROUTER_CONFIG.baseURL}/chat/completions`,
      {
        model,
        messages,
        max_tokens,
        temperature,
      },
      { headers: OPENROUTER_CONFIG.headers }
    );

    const result = response.data.choices[0].message.content;
    const usage = response.data.usage;

    return {
      content: [
        {
          type: "text" as const,
          text: `**Model:** ${model}\n**Response:** ${result}\n\n**Usage:**\n- Prompt tokens: ${usage.prompt_tokens}\n- Completion tokens: ${usage.completion_tokens}\n- Total tokens: ${usage.total_tokens}`,
        },
      ],
    };
  }

  private async compareModels(params: z.infer<typeof CompareModelsSchema>) {
    const { models, message, max_tokens } = params;

    const promises = models.map(async (model) => {
      try {
        const response = await axios.post(
          `${OPENROUTER_CONFIG.baseURL}/chat/completions`,
          {
            model,
            messages: [{ role: "user", content: message }],
            max_tokens,
          },
          { headers: OPENROUTER_CONFIG.headers }
        );

        return {
          model,
          response: response.data.choices[0].message.content,
          usage: response.data.usage,
          success: true,
        };
      } catch (error) {
        return {
          model,
          error: error instanceof Error ? error.message : "Unknown error",
          success: false,
        };
      }
    });

    const results = await Promise.all(promises);

    const formattedResults = results
      .map((result) => {
        if (result.success) {
          const successResult = result as any;
          return `**${result.model}:**\n${successResult.response}\n*Tokens: ${successResult.usage.total_tokens}*`;
        } else {
          const errorResult = result as any;
          return `**${result.model}:** ❌ Error - ${errorResult.error}`;
        }
      })
      .join("\n\n---\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Comparison of ${models.length} models:\n\n${formattedResults}`,
        },
      ],
    };
  }

  private async getModelInfo(params: { model: string }) {
    const response = await axios.get(`${OPENROUTER_CONFIG.baseURL}/models`, {
      headers: OPENROUTER_CONFIG.headers,
    });

    const model = response.data.data.find((m: any) => m.id === params.model);

    if (!model) {
      throw new Error(`Model ${params.model} not found`);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(model, null, 2),
        },
      ],
    };
  }

  private async generateImage(params: z.infer<typeof GenerateImageSchema>) {
    const { model, message, savefile } = params;
    const timestamp = new Date().toISOString();
    
    // 设置保存目录，默认为 ./images
    const saveDir = savefile || "./images";
    
    try {
      // 确保保存目录存在
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }

      // 确保日志目录存在
      const logDir = "./logs";
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const requestPayload = {
        model,
        messages: [
          {
            role: "system",
            content: "You are an AI that generates images. When asked to create an image, respond with a detailed image that matches the description. Make sure to output the image directly."
          },
          {
            role: "user", 
            content: `Please generate an image: ${message}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      };

      // 调用模型API - 使用对话的方式来生成图片
      const response = await axios.post(
        `${OPENROUTER_CONFIG.baseURL}/chat/completions`,
        requestPayload,
        { headers: OPENROUTER_CONFIG.headers }
      );

      const result = response.data;
      
      // 记录到文件
      const logEntry = {
        timestamp,
        model,
        message,
        savefile: savefile || 'default (./images)',
        request: requestPayload,
        response: result,
        status: response.status
      };
      
      const logFilename = `image_generation_${new Date().toISOString().split('T')[0]}.json`;
      const logPath = path.join(logDir, logFilename);
      
      // 读取已有日志或创建新的日志数组
      let logs: any[] = [];
      if (fs.existsSync(logPath)) {
        const existingLogs = fs.readFileSync(logPath, 'utf-8');
        logs = JSON.parse(existingLogs);
      }
      logs.push(logEntry);
      
      // 写入日志文件
      fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
      let imageData: string | null = null;
      let filename: string;
      
      // 检查响应中是否包含图片数据
      if (result.choices && result.choices[0]) {
        const choice = result.choices[0];
        
        // 首先检查 message.images 数组（Gemini Flash Image 模型的格式）
        if (choice.message && choice.message.images && Array.isArray(choice.message.images)) {
          for (const imageItem of choice.message.images) {
            if (imageItem.type === 'image_url' && imageItem.image_url && imageItem.image_url.url) {
              const url = imageItem.image_url.url;
              
              if (url.startsWith('data:image/')) {
                const [header, data] = url.split(',');
                const formatMatch = header.match(/data:image\/([^;]+)/);
                const extension = formatMatch ? (formatMatch[1] === 'jpeg' ? 'jpg' : formatMatch[1]) : 'png';
                imageData = data;
                filename = `generated_${Date.now()}.${extension}`;
                break;
              }
            }
          }
        }
        
        // 如果还没有找到图片，检查消息内容
        if (!imageData && choice.message && choice.message.content) {
          const content = choice.message.content;
          
          // 如果是文本响应，可能包含base64图片数据
          if (typeof content === 'string') {
            // 尝试从文本中提取base64图片数据
            const base64Regex = /data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=]+)/;
            const match = content.match(base64Regex);
            
            if (match) {
              imageData = match[2]; // base64数据部分
              const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
              filename = `generated_${Date.now()}.${extension}`;
            }
          }
          // 如果是数组格式（多模态响应）
          else if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'image' || item.type === 'image_url') {
                if (item.image_url && item.image_url.url) {
                  const url = item.image_url.url;
                  
                  if (url.startsWith('data:image/')) {
                    const [header, data] = url.split(',');
                    const formatMatch = header.match(/data:image\/([^;]+)/);
                    const extension = formatMatch ? (formatMatch[1] === 'jpeg' ? 'jpg' : formatMatch[1]) : 'png';
                    imageData = data;
                    filename = `generated_${Date.now()}.${extension}`;
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if (!imageData) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Model response received but no image data found. Response: ${JSON.stringify(result.choices[0]?.message?.content || "No content", null, 2)}`,
            },
          ],
        };
      }

      // 保存图片
      const filepath = path.join(saveDir, filename!);
      const buffer = Buffer.from(imageData, 'base64');
      
      fs.writeFileSync(filepath, buffer);

      const successMessage = `Image generated and saved successfully!\n\n**Model:** ${model}\n**Saved to:** ${filepath}\n**Size:** ${buffer.length} bytes\n**Prompt:** ${message}`;

      return {
        content: [
          {
            type: "text" as const,
            text: successMessage,
          },
        ],
      };

    } catch (error) {
      if (error instanceof Error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating image: ${error.message}`,
            },
          ],
        };
      }
      
      return {
        content: [
          {
            type: "text" as const,
            text: `Unknown error generating image: ${String(error)}`,
          },
        ],
      };
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenRouter MCP Server running on stdio");
  }
}

// Start the server
const server = new OpenRouterMCPServer();
server.run().catch(console.error);