# Multimodal Agent QA - 开发文档

## 1. 项目概述

Multimodal Agent QA 是一个多模态 AI 智能问答系统，支持文本对话、图像分析、图像生成、音频处理（语音识别与合成）、视频分析等多种交互方式。系统采用前后端分离架构，后端基于 FastAPI 构建，前端使用 Next.js + React + TypeScript 开发。

### 1.1 核心功能

| 功能模块 | 描述 |
|---------|------|
| 文本对话 | 基于 DeepSeek 大语言模型的自然语言对话 |
| 图像分析 | 使用阿里云通义千问 VL 模型分析图像内容 |
| 图像生成 | 使用阿里云通义万相 2.7 模型生成图片（文生图/图生图） |
| 语音识别 (STT) | 使用阿里云 Paraformer 模型将语音转为文本 |
| 语音合成 (TTS) | 使用阿里云 CosyVoice 模型将文本转为语音 |
| 视频分析 | 使用 OpenCV 提取视频关键帧并分析内容 |
| 工具调用 | 支持网络搜索、数学计算等工具调用 |
| 对话管理 | 支持多对话管理、上下文记忆、历史消息查询 |
| 流式响应 | 支持 SSE 流式输出，实时显示 AI 回复 |

### 1.2 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      前端 (Next.js)                      │
│  ┌──────────┐  ┌──────────┐  ──────────┐  ┌─────────┐ │
│  │ ChatWindow│  │ Sidebar  │  │MessageBubble│ │ChatInput│ │
│  └──────────  └──────────┘  └──────────┘  └─────────┘ │
│  ┌──────────┐  ──────────┐  ┌──────────┐              │
│  │ImagePreview│ │AudioRecorder│ │FileUpload│            │
│  └──────────┘  └──────────  └──────────┘              │
─────────────────────────────────────────────────────────┘
                          ↕ HTTP/API
┌─────────────────────────────────────────────────────────┐
│                    后端 (FastAPI)                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              API Routes (REST API)                │   │
│  │  /api/v1/chat  /api/v1/upload  /api/v1/conversation│  │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Agent Core (推理引擎)                 │   │
│  │  ┌─────────────┐  ──────────────────────────┐   │   │
│  │  │ Memory Manager│  │    Tool Registry         │   │   │
│  │  └─────────────┘  └──────────────────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Services Layer                       │   │
│  │  OpenAI Service / Audio Service / File Utils     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│                    外部服务                               │
│  DeepSeek API / 阿里云百炼 (DashScope) / SQLite          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 项目结构

```
ai_agent_qa/
├── backend/                          # 后端服务
│   ├── main.py                       # FastAPI 应用入口
│   ├── config/                       # 配置模块
│   │   ├── settings.py               # 应用配置（从 .env 加载）
│   │   └── constants.py              # 常量定义
│   ├── agents/                       # Agent 核心模块
│   │   ├── agent.py                  # Agent 推理引擎
│   │   ├── memory/                   # 记忆管理
│   │   │   └── memory_manager.py     # 对话记忆 + 长期记忆
│   │   ── tools/                    # 工具模块
│   │       ├── web_search.py         # 网络搜索工具
│   │       ├── calculator.py         # 数学计算工具
│   │       ├── image_analyzer.py     # 图像分析工具
│   │       ├── image_generator.py    # 图像生成工具
│   │       └── video_analyzer.py     # 视频分析工具
│   ├── api/                          # API 路由
│   │   └── v1/
│   │       ├── routes/
│   │       │   ├── chat.py           # 聊天接口
│   │       │   ├── conversation.py   # 对话管理接口
│   │       │   └── upload.py         # 文件上传接口
│   │       └── models/               # 请求/响应模型
│   ├── services/                     # 服务层
│   │   ├── openai_service.py         # OpenAI/DashScope API 封装
│   │   └── audio_service.py          # 音频处理服务
│   ├── db/                           # 数据库模块
│   │   ├── database.py               # 数据库连接管理
│   │   ├── models/                   # SQLAlchemy 模型
│   │   │   └── user.py               # 用户/对话/消息模型
│   │   └── schemas/                  # Pydantic Schema
│   │       └── message.py            # 消息 Schema
│   ├── utils/                        # 工具函数
│   │   └── file_utils.py             # 文件处理工具
│   └── requirements.txt              # Python 依赖
├── frontend/                         # 前端应用
│   ├── src/
│   │   ├── app/                      # Next.js App Router
│   │   │   ├── layout.tsx            # 根布局
│   │   │   └── page.tsx              # 首页
│   │   ├── components/               # React 组件
│   │   │   ├── layout/               # 布局组件
│   │   │   │   ├── ChatWindow.tsx    # 聊天窗口
│   │   │   │   └── Sidebar.tsx       # 侧边栏
│   │   │   ├── multimodal/           # 多模态组件
│   │   │   │   ├── ImagePreview.tsx  # 图片预览
│   │   │   │   ├── AudioRecorder.tsx # 录音组件
│   │   │   │   └── FileUpload.tsx    # 文件上传
│   │   │   └── ui/                   # UI 组件
│   │   │       ├── MessageBubble.tsx # 消息气泡
│   │   │       └── ChatInput.tsx     # 聊天输入框
│   │   ├── hooks/                    # React Hooks
│   │   │   ├── useChat.ts            # 聊天状态管理
│   │   │   └── useUpload.ts          # 上传状态管理
│   │   ├── services/                 # API 服务层
│   │   │   └── api.ts                # API 调用封装
│   │   └── types/                    # TypeScript 类型定义
│   │       └── index.ts              # 类型定义
│   ├── public/                       # 静态资源
│   ├── package.json                  # 前端依赖
│   ├── next.config.js                # Next.js 配置
│   ├── tailwind.config.js            # Tailwind CSS 配置
│   └── tsconfig.json                 # TypeScript 配置
├── uploads/                          # 文件上传目录
│   ├── images/                       # 图片文件
│   ├── audio/                        # 音频文件
│   └── videos/                       # 视频文件
├── .env                              # 环境变量配置
├── .gitignore                        # Git 忽略配置
└── ai_agent_qa.db                    # SQLite 数据库文件
```

---

## 3. 环境配置

### 3.1 环境变量 (.env)

```env
# OpenAI配置（DeepSeek 兼容 OpenAI 格式）
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat

# 图像识别（阿里云通义千问 VL）
OPENAI_VISION_BASE_URL=https://ws-xxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
OPENAI_VISION_API_KEY=sk-ws-xxx
OPENAI_VISION_MODEL=qwen-vl-max

# 图像生成（阿里云通义万相 2.7）
DASHSCOPE_API_KEY=sk-ws-xxx
DASHSCOPE_API_HOST=ws-xxx.cn-beijing.maas.aliyuncs.com
IMAGE_GEN_MODEL=wan2.7-image
IMAGE_GEN_SIZE=1K
IMAGE_GEN_N=1

# 语音 API（阿里云百炼标准 API）
DASHSCOPE_API_KEY_FOR_VOICE=sk-xxx
VOICE_STT_MODEL=paraformer-v2
VOICE_TTS_MODEL=cosyvoice-v1
VOICE_TTS_VOICE=longxiaochun

# 数据库配置
DATABASE_URL=sqlite+aiosqlite:///./ai_agent_qa.db

# 应用配置
APP_NAME=Multimodal Agent QA
APP_VERSION=1.0.0
DEBUG=True
API_V1_PREFIX=/api/v1

# 文件上传配置
MAX_UPLOAD_SIZE=104857600
UPLOAD_DIR=uploads

# CORS配置
CORS_ORIGINS=["http://localhost:3000","http://localhost:3001"]
```

### 3.2 启动服务

**后端启动：**
```bash
cd ai_agent_qa
python -m uvicorn backend.main:app --reload --port 8000
```

**前端启动：**
```bash
cd ai_agent_qa/frontend
npm install
npm run dev
```

访问地址：http://localhost:3000

---

## 4. API 接口文档

### 4.1 聊天接口

#### 发送消息
```
POST /api/v1/chat
```

**请求体：**
```json
{
  "conversation_id": "uuid-string",
  "message": "你好",
  "content_type": "text",
  "file_url": null,
  "file_path": null,
  "metadata": {}
}
```

**响应：**
```json
{
  "conversation_id": "uuid-string",
  "message_id": "uuid-string",
  "response": "你好！有什么我可以帮你的吗？",
  "content_type": "text",
  "timestamp": "2026-08-31T07:00:00Z",
  "metadata": {
    "tool_calls": 0,
    "usage": {...},
    "generated_image_urls": []
  }
}
```

#### 流式消息
```
POST /api/v1/chat/stream
```
使用 Server-Sent Events (SSE) 流式返回 AI 回复。

### 4.2 文件上传接口

#### 通用上传
```
POST /api/v1/upload
Content-Type: multipart/form-data
```

#### 图片上传
```
POST /api/v1/upload/image
Content-Type: multipart/form-data
```

#### 音频上传
```
POST /api/v1/upload/audio
Content-Type: multipart/form-data
```

**响应：**
```json
{
  "file_path": "uploads/images/xxx.jpg",
  "file_url": "/uploads/images/xxx.jpg",
  "file_size": 102400,
  "content_type": "image/jpeg"
}
```

### 4.3 对话管理接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/v1/conversations | 获取对话列表 |
| GET | /api/v1/conversations/{id} | 获取对话详情（含消息） |
| DELETE | /api/v1/conversations/{id} | 删除对话 |

---

## 5. 核心模块说明

### 5.1 Agent 推理引擎 (agent.py)

Agent 是系统的核心，负责：
1. **消息预处理**：根据内容类型（文本/图像/音频/视频）进行预处理
2. **工具调用**：LLM 返回工具调用时，执行对应工具并获取结果
3. **上下文管理**：维护对话历史，提供给 LLM 作为上下文
4. **响应处理**：处理 LLM 返回结果，包括工具调用结果整合

**处理流程：**
```
用户消息 → 内容类型判断 → 预处理（图像分析/语音识别/视频分析）
    → 构建 LLM 消息列表 → 调用 LLM → 工具调用？
        → 是：执行工具 → 再次调用 LLM → 返回最终回复
        → 否：直接返回回复
```

### 5.2 记忆管理 (memory_manager.py)

- **ConversationMemory**：对话级记忆，使用 deque 维护最近 N 条消息
- **LongTermMemory**：长期记忆，跨对话的知识存储

### 5.3 工具模块

| 工具 | 功能 | 实现方式 |
|------|------|---------|
| WebSearchTool | 网络搜索 | DuckDuckGo 搜索 API |
| CalculatorTool | 数学计算 | 安全表达式求值 |
| ImageAnalyzerTool | 图像分析 | 阿里云通义千问 VL |
| ImageGeneratorTool | 图像生成 | 阿里云通义万相 2.7 |
| VideoAnalyzerTool | 视频分析 | OpenCV 关键帧提取 + VL 模型 |

### 5.4 服务层 (openai_service.py)

封装了所有外部 API 调用：
- **chat_completion()**：文本对话（DeepSeek）
- **vision_chat()**：视觉对话（通义千问 VL）
- **audio_to_text()**：语音识别（Paraformer）
- **text_to_speech()**：语音合成（CosyVoice）
- **generate_image()**：图像生成（通义万相）
- **stream_chat()**：流式对话

---

## 6. 数据库设计

### 6.1 数据模型

**Conversation（对话）：**
- id: UUID 主键
- user_id: 用户 ID
- title: 对话标题
- created_at: 创建时间
- updated_at: 更新时间

**Message（消息）：**
- id: UUID 主键
- conversation_id: 对话 ID（外键）
- sender_type: 发送者类型（user/agent）
- content_type: 内容类型（text/image/audio/video）
- content: 消息内容
- file_path: 文件路径
- file_url: 文件 URL
- timestamp: 时间戳
- metadata_json: 元数据（JSON）

### 6.2 数据库技术

- **SQLite**：轻量级数据库，无需额外安装
- **aiosqlite**：异步 SQLite 驱动
- **SQLAlchemy 2.0**：ORM 框架

---

## 7. 前端架构

### 7.1 技术栈

- **Next.js 14**：React 框架，支持 App Router
- **React 18**：UI 库
- **TypeScript**：类型安全
- **Tailwind CSS**：样式框架
- **Axios**：HTTP 客户端
- **React Markdown**：Markdown 渲染
- **Lucide React**：图标库

### 7.2 状态管理

使用 React Hooks 进行状态管理：
- **useChat**：聊天状态管理（消息列表、对话列表、加载状态等）
- **useUpload**：文件上传状态管理

### 7.3 组件结构

```
App
├── Sidebar                    # 侧边栏（对话列表）
└── ChatWindow                 # 聊天窗口
    ├── MessageBubble          # 消息气泡（支持文本/图片/音频）
    │   ├── ImagePreview       # 图片预览
    │   └── AudioPlayer        # 音频播放
    └── ChatInput              # 输入框
        ├── FileUpload         # 文件上传按钮
        └── AudioRecorder      # 录音按钮
```

---

## 8. 部署说明

### 8.1 开发环境

```bash
# 后端
cd ai_agent_qa
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --port 8000

# 前端
cd ai_agent_qa/frontend
npm install
npm run dev
```

### 8.2 生产环境

```bash
# 后端
cd ai_agent_qa
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# 前端
cd ai_agent_qa/frontend
npm install
npm run build
npm start
```

### 8.3 注意事项

1. **环境变量**：生产环境必须修改 `SECRET_KEY`
2. **CORS 配置**：根据实际域名修改 `CORS_ORIGINS`
3. **API Key**：确保所有 API Key 已正确配置
4. **数据库**：生产环境建议使用 PostgreSQL 替代 SQLite

---

## 9. 常见问题

### 9.1 uvicorn 热重载不生效

uvicorn 的 `--reload` 只监听 `.py` 文件变化，不监听 `.env` 文件。修改 `.env` 后需要手动重启服务。

### 9.2 图片分析失败

检查 `image_analyzer.py` 中的路径拼接逻辑，确保 `project_root` 计算正确。

### 9.3 语音功能不可用

MaaS 工作空间 Key（`sk-ws-H.*`）不支持 STT/TTS，需要使用标准 DashScope API Key。

---

## 10. 更新日志

### v1.0.0 (2026-08-31)
- 初始版本发布
- 支持文本对话、图像分析、图像生成
- 支持语音识别（STT）和语音合成（TTS）
- 支持视频分析
- 支持工具调用（搜索、计算）
- 支持对话管理和上下文记忆
- 支持流式响应
