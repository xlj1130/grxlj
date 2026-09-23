# Multimodal Agent QA - 技术栈与问题解决文档

## 1. 技术栈总览

### 1.1 后端技术栈

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **Web 框架** | FastAPI | 0.115.0 | 高性能异步 Web 框架 |
| **ASGI 服务器** | Uvicorn | 0.30.0 | ASGI 服务器，支持热重载 |
| **ORM** | SQLAlchemy | 2.0.35 | 数据库 ORM 框架 |
| **异步数据库驱动** | aiosqlite | 0.20.0 | SQLite 异步驱动 |
| **数据验证** | Pydantic | 2.9.0 | 数据验证和序列化 |
| **配置管理** | pydantic-settings | 2.5.0 | 从 .env 加载配置 |
| **AI 客户端** | openai | 1.50.0 | OpenAI API 客户端（兼容 DeepSeek） |
| **HTTP 客户端** | httpx | 0.27.0 | 异步 HTTP 客户端 |
| **图像处理** | Pillow | 10.4.0 | 图片压缩和格式转换 |
| **视频处理** | opencv-python-headless | 4.9.0+ | 视频关键帧提取 |
| **文件处理** | aiofiles | 24.1.0 | 异步文件读写 |
| **缓存** | Redis | 5.1.0 | 会话缓存（可选） |

### 1.2 前端技术栈

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **框架** | Next.js | 14.2.0 | React 全栈框架 |
| **UI 库** | React | 18.3.0 | 用户界面库 |
| **语言** | TypeScript | 5.5.0 | 类型安全 |
| **样式** | Tailwind CSS | 3.4.0 | 实用优先 CSS 框架 |
| **HTTP 客户端** | Axios | 1.7.0 | API 请求 |
| **Markdown** | react-markdown | 9.0.0 | Markdown 渲染 |
| **图标** | lucide-react | 0.400.0 | 图标库 |
| **日期处理** | date-fns | 3.6.0 | 日期格式化 |

### 1.3 AI 服务

| 服务 | 模型 | 用途 | API 类型 |
|------|------|------|---------|
| **文本对话** | DeepSeek Chat | 自然语言对话 | OpenAI 兼容 API |
| **图像识别** | 通义千问 VL Max | 图像内容分析 | OpenAI 兼容 API (MaaS) |
| **图像生成** | 通义万相 2.7 | 文生图/图生图 | DashScope 原生 API (MaaS) |
| **语音识别** | Paraformer v2 | 语音转文本 | DashScope 标准 API |
| **语音合成** | CosyVoice v1 | 文本转语音 | DashScope 标准 API |

### 1.4 开发环境

| 项目 | 配置 |
|------|------|
| **操作系统** | Windows 11 |
| **Python** | 3.14.4 |
| **Node.js** | 20.x |
| **IDE** | PyCharm 2025.2.1 |
| **数据库** | SQLite（开发环境） |

---

## 2. 开发过程中遇到的问题及解决方案

### 2.1 数据库相关问题

#### 问题 1：PostgreSQL 环境配置复杂

**问题描述：**
项目初期计划使用 PostgreSQL 作为数据库，但用户本地没有安装 PostgreSQL，配置过程复杂，阻塞了开发进度。

**解决方案：**
将数据库从 PostgreSQL 迁移到 SQLite，实现零配置运行。

**修改内容：**
- `.env`：`DATABASE_URL=sqlite+aiosqlite:///./ai_agent_qa.db`
- `settings.py`：移除 PostgreSQL 相关配置
- `database.py`：使用 aiosqlite 替代 asyncpg
- `requirements.txt`：移除 asyncpg，添加 aiosqlite

**经验总结：**
开发阶段优先选择零配置的数据库方案，避免环境配置阻塞开发进度。

---

#### 问题 2：SQLAlchemy 2.0 + Python 3.14 兼容性

**问题描述：**
使用 SQLAlchemy 2.0 时，`declarative_base` 的导入方式在 Python 3.14 下报错。

**错误信息：**
```
ImportError: cannot import name 'declarative_base' from 'sqlalchemy.ext.declarative'
```

**解决方案：**
从 `sqlalchemy.orm` 导入 `declarative_base`：
```python
from sqlalchemy.orm import declarative_base
```

---

#### 问题 3：datetime.utcnow() 弃用

**问题描述：**
Python 3.14 弃用了 `datetime.utcnow()`，导致警告和潜在错误。

**解决方案：**
使用 `datetime.now(timezone.utc)` 替代：
```python
from datetime import datetime, timezone

# 旧代码
created_at = datetime.utcnow()

# 新代码
created_at = datetime.now(timezone.utc)
```

---

### 2.2 Pydantic 相关问题

#### 问题 4：Pydantic v2 regex 参数弃用

**问题描述：**
Pydantic v2 弃用了 `regex` 参数，改用 `pattern`。

**错误信息：**
```
DeprecationWarning: `regex` has been deprecated, use `pattern` instead
```

**解决方案：**
```python
# 旧代码
field: str = Field(..., regex=r"^[a-z]+$")

# 新代码
field: str = Field(..., pattern=r"^[a-z]+$")
```

---

#### 问题 5：FastAPI 响应模型中 Pydantic 对象序列化失败

**问题描述：**
Agent 返回的 metadata 中包含 SQLAlchemy 或 Pydantic 对象，导致 JSON 序列化失败。

**错误信息：**
```
TypeError: Object of type X is not JSON serializable
```

**解决方案：**
在返回前将对象转换为纯 dict：
```python
# 将 usage 对象转为纯 dict
usage_data = response.get("usage")
if usage_data and hasattr(usage_data, 'model_dump'):
    usage_data = usage_data.model_dump()
elif usage_data and hasattr(usage_data, 'dict'):
    usage_data = usage_data.dict()

# 验证可序列化
try:
    json.dumps(metadata, ensure_ascii=False)
except (TypeError, ValueError) as e:
    # 移除不可序列化的字段
    metadata = {"tool_calls": 0}
```

---

### 2.3 文件路径相关问题

#### 问题 6：图片上传后路径拼接错误

**问题描述：**
图片上传后，`image_analyzer.py` 中的 `_local_file_to_base64()` 方法将相对路径转换为绝对路径时，`project_root` 计算层级错误，导致路径变成 `C:\Users\86188\PyCharmMiscProject\ai_agent_qa\backend\uploads/images/...`（多了 `backend` 层）。

**错误信息：**
```
文件不存在: C:\Users\86188\PyCharmMiscProject\ai_agent_qa\backend\uploads\images\xxx.jpg
```

**解决方案：**
修正 `project_root` 计算层级。从 `backend/agents/tools/image_analyzer.py` 向上 4 层到项目根目录：
```python
# 当前文件路径: ai_agent_qa/backend/agents/tools/image_analyzer.py
# 需要向上4层: tools -> agents -> backend -> ai_agent_qa
self.project_root = os.path.dirname(
    os.path.dirname(
        os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))
        )
    )
)
```

**经验总结：**
相对路径转绝对路径时，必须仔细计算 `__file__` 到项目根目录的层级数。

---

#### 问题 7：音频文件路径转换错误

**问题描述：**
前端只发送 `file_url`（如 `/uploads/audio/xxx.webm`），但后端 `agent.py` 检查的是 `file_path`，导致音频文件找不到。

**解决方案：**
在 `agent.py` 中添加从 `file_url` 到本地路径的转换逻辑：
```python
elif content_type == "audio" and (file_path or file_url):
    audio_file_path = file_path
    if not audio_file_path and file_url:
        import os
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        audio_file_path = os.path.join(project_root, file_url.lstrip("/"))
```

---

### 2.4 图像生成相关问题

#### 问题 8：aiohttp 在 Windows Python 3.14 下编译失败

**问题描述：**
图像生成功能需要使用 HTTP 客户端调用 DashScope API，最初使用 `aiohttp`，但在 Windows Python 3.14 环境下需要 C++ 编译工具，安装失败。

**错误信息：**
```
error: Microsoft Visual C++ 14.0 or greater is required
```

**解决方案：**
使用已安装的 `httpx` 库替代 `aiohttp`：
```python
# 旧代码（需要 aiohttp）
import aiohttp
async with aiohttp.ClientSession() as session:
    async with session.post(url, json=payload) as resp:
        ...

# 新代码（使用 httpx）
import httpx
async with httpx.AsyncClient(timeout=120.0) as client:
    resp = await client.post(url, json=payload)
```

---

#### 问题 9：MaaS Key 不能用于标准 DashScope API

**问题描述：**
图像生成使用的 `DASHSCOPE_API_KEY` 是 MaaS 工作空间 Key（格式 `sk-ws-H.*`），不能用于标准 DashScope API。

**错误信息：**
```
401 Unauthorized: InvalidApiKey
```

**解决方案：**
- MaaS 工作空间 Key 只能用于对应工作空间的 OpenAI 兼容端点
- 标准 DashScope API 需要使用标准 API Key（从 https://bailian.console.aliyun.com/ 获取）
- 图像生成使用 MaaS Host 的原生 API 路径，配合 MaaS Key

---

### 2.5 配置相关问题

#### 问题 10：uvicorn 热重载不监听 .env 文件

**问题描述：**
修改 `.env` 文件后，uvicorn 的 `--reload` 模式不会自动重新加载配置，导致新配置不生效。

**现象：**
- 修改了 `OPENAI_API_KEY` 或 `OPENAI_MODEL`
- uvicorn 显示 "Detected file change" 但只针对 `.py` 文件
- API 请求仍然使用旧配置

**根本原因：**
- uvicorn 的 `--reload` 只监控源代码文件（`.py`）
- `pydantic-settings` 在模块导入时读取 `.env`，后续修改不会自动生效

**解决方案：**
修改 `.env` 后必须手动重启 uvicorn 服务：
```bash
# 停止当前 uvicorn（Ctrl+C）
# 重新启动
python -m uvicorn backend.main:app --reload --port 8000
```

**经验总结：**
在开发环境中添加关键配置项的启动日志输出，便于快速定位配置加载问题：
```python
logger.info(f"OpenAI client initialized: base_url={settings.OPENAI_BASE_URL}, model={self.model}")
logger.info(f"API Key: ...{settings.OPENAI_API_KEY[-6:]}")
```

---

#### 问题 11：DeepSeek 模型名混淆

**问题描述：**
用户混淆了 DeepSeek 云端 API 与 Ollama 本地模型的命名规范。

**错误配置：**
```env
OPENAI_MODEL=deepseek-r1:8b  # 这是 Ollama 本地模型名
```

**正确配置：**
```env
OPENAI_MODEL=deepseek-chat   # DeepSeek 云端 API 模型名
```

**经验总结：**
- `deepseek-r1:8b` 是 Ollama 本地模型名，格式为 `模型名:参数量`
- DeepSeek 云端 API 使用 `deepseek-chat` 或 `deepseek-reasoner`
- 两者完全不兼容，不能混用

---

### 2.6 语音功能相关问题

#### 问题 12：MaaS 工作空间不支持 STT/TTS 端点

**问题描述：**
使用 MaaS 工作空间 Key（`sk-ws-H.*`）调用 STT/TTS API 时，所有端点都返回错误。

**尝试过的端点及错误：**

| 端点 | 错误 |
|------|------|
| `/compatible-mode/v1/audio/transcriptions` | 404 Not Found |
| `/compatible-mode/v1/audio/speech` | 404 Not Found |
| `/api/v1/services/audio/asr/transcription` (同步) | 403 AccessDenied: "current user api does not support synchronous calls" |
| `/api/v1/services/audio/asr/transcription` (异步) | 400 InvalidParameter: "input must contain file_urls" |
| `/api/v1/services/aigc/text2audio/generation` | 400 InvalidParameter: "url error" |

**根本原因：**
MaaS 工作空间只支持 chat completions 端点（`/compatible-mode/v1/chat/completions`），不支持 STT/TTS 端点。

**解决方案：**
使用标准 DashScope API Key 调用 STT/TTS：
```env
# 标准 DashScope API Key（从 https://bailian.console.aliyun.com/ 获取）
DASHSCOPE_API_KEY_FOR_VOICE=sk-xxx

# STT 端点
https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions

# TTS 端点
https://dashscope.aliyuncs.com/compatible-mode/v1/audio/speech
```

**经验总结：**
- MaaS 工作空间 Key（`sk-ws-H.*`）只能用于该工作空间的 chat completions
- STT/TTS 需要使用标准 DashScope API Key
- 不同功能可能需要不同的 API Key 和端点

---

#### 问题 13：异步 STT API 需要 file_urls 而非 base64

**问题描述：**
MaaS 异步 STT API 返回错误：`input must contain file_urls`。

**错误请求：**
```json
{
  "input": {
    "audio": "base64编码的音频数据"
  }
}
```

**正确请求格式：**
```json
{
  "input": {
    "file_urls": ["https://example.com/audio.wav"]
  }
}
```

**解决方案：**
由于本地开发环境无法提供公开可访问的文件 URL，最终改用标准 DashScope API 的 OpenAI 兼容端点，支持直接上传文件（multipart/form-data）。

---

### 2.7 其他问题

#### 问题 14：__pycache__ 缓存导致旧代码运行

**问题描述：**
修改代码后，Python 的 `__pycache__` 目录中缓存了旧的字节码文件，导致新代码不生效。

**解决方案：**
清除所有 `__pycache__` 目录：
```powershell
Get-ChildItem -Path "." -Recurse -Directory -Filter "__pycache__" | ForEach-Object { Remove-Item -Recurse -Force $_.FullName }
```

---

#### 问题 15：图片压缩策略

**问题描述：**
阿里云 VL 模型对 base64 图片有大小限制，大图片上传后分析失败。

**解决方案：**
统一压缩策略，所有图片都通过 PIL 处理：
1. 等比缩放，最大边长 1024px
2. 统一转为 RGB JPEG 格式
3. JPEG 质量 85%，启用优化

```python
# 缩放
max_dim = max(img.size)
if max_dim > 1024:
    ratio = 1024 / max_dim
    new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
    img = img.resize(new_size, Image.LANCZOS)

# 转为 RGB JPEG
if img.mode in ('RGBA', 'LA', 'P'):
    background = Image.new('RGB', img.size, (255, 255, 255))
    if img.mode == 'P':
        img = img.convert('RGBA')
    background.paste(img, mask=img.split()[-1] if 'A' in img.mode else None)
    img = background

# 编码
buffer = io.BytesIO()
img.save(buffer, format='JPEG', quality=85, optimize=True)
```

---

## 3. 关键决策记录

### 3.1 数据库选择：SQLite vs PostgreSQL

**决策：** 开发阶段使用 SQLite

**理由：**
- 零配置，无需安装额外软件
- 单文件数据库，便于版本控制和备份
- 开发阶段数据量小，性能不是瓶颈
- 后续可轻松迁移到 PostgreSQL

**权衡：**
- SQLite 不支持高并发写入
- 生产环境建议迁移到 PostgreSQL

---

### 3.2 HTTP 客户端选择：httpx vs aiohttp

**决策：** 使用 httpx

**理由：**
- httpx 已安装在项目中（OpenAI SDK 依赖）
- aiohttp 在 Windows Python 3.14 下需要 C++ 编译工具
- httpx API 简洁，支持异步

---

### 3.3 AI 服务架构：多 Key 多端点

**决策：** 不同功能使用不同的 API Key 和端点

**架构：**
```
文本对话 → DeepSeek API（OPENAI_API_KEY）
图像识别 → 通义千问 VL MaaS 端点（OPENAI_VISION_API_KEY）
图像生成 → 通义万相 MaaS 端点（DASHSCOPE_API_KEY）
语音 STT/TTS → DashScope 标准 API（DASHSCOPE_API_KEY_FOR_VOICE）
```

**理由：**
- MaaS 工作空间 Key 只能用于对应工作空间的端点
- 不同功能可能需要不同的模型和工作空间
- 独立 Key 便于权限管理和成本控制

---

## 4. 经验总结

### 4.1 开发环境相关

1. **uvicorn 热重载限制**：`--reload` 只监听 `.py` 文件，修改 `.env` 需手动重启
2. **Python 版本兼容性**：Python 3.14 弃用了部分 API（如 `datetime.utcnow()`）
3. **Windows 编译问题**：某些 Python 包（如 aiohttp）在 Windows 下需要 C++ 编译工具
4. **__pycache__ 缓存**：修改代码后可能需要清除缓存才能生效

### 4.2 API 集成相关

1. **MaaS Key vs 标准 Key**：MaaS 工作空间 Key 只能用于对应工作空间的端点
2. **OpenAI 兼容模式**：阿里云百炼支持 OpenAI 兼容 API，但不同工作空间支持的端点不同
3. **异步 vs 同步 API**：某些 MaaS API 只支持异步模式，需要提交任务后轮询结果
4. **文件上传格式**：STT API 可能需要 file_urls 而非 base64 数据

### 4.3 路径处理相关

1. **相对路径转换**：从 `__file__` 计算项目根目录时，必须仔细数层级
2. **路径分隔符**：Windows 使用 `\`，URL 使用 `/`，需要统一处理
3. **文件存在性检查**：转换路径后必须检查文件是否存在

### 4.4 序列化相关

1. **Pydantic 对象序列化**：返回给 FastAPI 的对象必须是 JSON 可序列化的
2. **SQLAlchemy 对象**：需要转换为 dict 才能序列化
3. **metadata 验证**：返回前验证 metadata 可序列化，失败时移除问题字段

---

## 5. 待优化项

1. **数据库迁移**：生产环境迁移到 PostgreSQL
2. **用户认证**：实现完整的用户认证和授权
3. **Redis 集成**：使用 Redis 进行会话缓存和速率限制
4. **语音功能完善**：获取标准 DashScope API Key 后完善 STT/TTS 功能
5. **视频分析优化**：优化关键帧提取策略，提高分析准确性
6. **前端优化**：添加更多交互反馈，优化移动端体验
7. **测试覆盖**：添加单元测试和集成测试
8. **日志系统**：集成结构化日志（如 JSON 格式日志）
9. **监控告警**：添加性能监控和错误告警
10. **Docker 部署**：提供 Docker 镜像和 docker-compose 配置
