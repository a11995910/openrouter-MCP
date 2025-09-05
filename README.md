# OpenRouter MCP 服务器

一个模型上下文协议（MCP）服务器，通过 Claude 提供对 OpenRouter 超过 400 个 AI 模型的访问。

## 功能特性

- 🤖 访问超过 400 个语言模型，包括 GPT-4、Claude、Gemini、Llama 等
- 🎨 **图像生成功能** - 支持使用 DALL-E、Gemini、Flux 等模型生成图片并保存到本地
- 🔍 列出和搜索可用模型及其定价信息
- 💬 通过统一接口与任何模型聊天
- 🔄 并排比较多个模型的响应
- 📊 获取详细的模型信息，包括上下文限制和功能
- 🔧 与 Claude Desktop 和 Claude Code 无缝集成

## 安装

```bash
# 克隆仓库
git clone https://github.com/a11995910/openrouter-MCP.git
cd openrouter-MCP

# 安装依赖
npm install
# 或者
yarn install

# 构建 TypeScript 代码
npm run build
# 或者
yarn build
```

## 配置

1. 从 [OpenRouter](https://openrouter.ai/keys) 获取你的 OpenRouter API 密钥
2. 复制 `.env.example` 为 `.env`：
   ```bash
   cp .env.example .env
   ```
3. 编辑 `.env` 文件并添加你的 API 密钥：
   ```env
   OPENROUTER_API_KEY=你的API密钥
   ```

## 使用方法

### 可用的 MCP 工具

- **`list_models`** - 获取所有可用模型及其定价的列表
- **`chat_with_model`** - 向特定模型发送消息
  - 参数: `model`, `message`, `max_tokens`, `temperature`, `system_prompt`
- **`compare_models`** - 比较多个模型的响应
  - 参数: `models[]`, `message`, `max_tokens`
- **`get_model_info`** - 获取特定模型的详细信息
  - 参数: `model`
- **`generate_image`** - 使用支持图像生成的模型生成图片并保存到本地
  - 参数: `model`, `message`, `savefile` (可选，默认保存到 ./images 目录)

### 可用的 MCP 资源

- **`openrouter://models`** - 所有可用模型及其定价的列表
- **`openrouter://pricing`** - 所有模型的当前定价信息
- **`openrouter://usage`** - 你的 OpenRouter 使用统计

### Claude Code 集成

将服务器添加到 Claude Code：

```bash
claude mcp add openrouter -s user \
  -e OPENROUTER_API_KEY=你的API密钥 \
  -- node /path/to/openrouter-mcp/dist/server.js
```

或手动添加到你的 Claude Desktop 配置：

```json
{
  "mcpServers": {
    "openrouter": {
      "command": "node",
      "args": ["/path/to/openrouter-mcp/dist/server.js"],
      "env": {
        "OPENROUTER_API_KEY": "你的API密钥"
      }
    }
  }
}
```

## 使用示例

配置完成后，你可以在 Claude 中使用这些命令：

### 文本对话示例
```
"列出所有可用的 Gemma 模型"
"与 gpt-4 聊天并询问量子计算的解释"
"比较 claude-3-opus 和 gpt-4 关于气候变化的响应"
"获取 google/gemini-pro 的详细信息"
```

### 图像生成示例
```
"使用 google/gemini-2.5-flash-image-preview:free 模型生成一张关于未来城市的图片"
"用 DALL-E 生成一只可爱的卡通猫咪图片，保存到 /path/to/images 目录"
"生成一幅抽象艺术风格的山水画"
```

**推荐的图像生成模型:**
- `google/gemini-2.5-flash-image-preview:free` - 免费的 Gemini 图像生成模型
- `openai/dall-e-3` - OpenAI 的 DALL-E 3 模型
- `black-forest-labs/flux-1.1-pro` - Flux 专业图像生成模型

## 开发

```bash
# 以开发模式运行
npm run dev

# 运行测试
npm test

# 代码检查
npm run lint

# 类型检查
npm run typecheck
```

## 环境变量

- `OPENROUTER_API_KEY` - 你的 OpenRouter API 密钥（必需）
- `OPENROUTER_BASE_URL` - API 基础 URL（默认: https://openrouter.ai/api/v1）
- `OPENROUTER_SITE_URL` - 用于 API 归属的站点 URL
- `OPENROUTER_APP_NAME` - API 请求头中的应用程序名称

## 安全性

- API 密钥仅存储在环境变量中
- `.env` 文件被排除在版本控制之外
- 永远不要将你的 API 密钥提交到仓库中

## 许可证

MIT

## 贡献

欢迎贡献！请随时提交 Pull Request。