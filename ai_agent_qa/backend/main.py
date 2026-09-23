"""
Multimodal Agent QA - FastAPI 主应用入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import logging
import os

from .config.settings import settings
from .db.database import init_db, close_db

# 配置日志
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info("🚀 正在启动 Multimodal Agent QA 服务...")
    await init_db()
    logger.info("✅ 数据库初始化完成")
    
    # 确保上传目录存在
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    
    yield
    
    # 关闭时
    logger.info("🛑 正在关闭服务...")
    await close_db()


# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="多模态 AI Agent 问答系统 - 支持文本、图像、音频、视频交互",
    lifespan=lifespan
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件（上传目录）
if os.path.exists(settings.UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# 注册路由
from .api.v1.routes import chat, conversation, upload

app.include_router(
    chat.router,
    prefix=settings.API_V1_PREFIX,
    tags=["聊天"]
)
app.include_router(
    conversation.router,
    prefix=settings.API_V1_PREFIX,
    tags=["对话管理"]
)
app.include_router(
    upload.router,
    prefix=settings.API_V1_PREFIX,
    tags=["文件上传"]
)


@app.get("/")
async def root():
    """根路由"""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy"}
