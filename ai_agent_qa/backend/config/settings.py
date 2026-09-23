"""
配置管理模块
负责加载和管理所有配置项
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """应用配置"""
    
    # 应用配置
    APP_NAME: str = "Multimodal Agent QA"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    
    # OpenAI配置
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    
    # Vision 专用配置（可与文本对话使用不同的 API）
    OPENAI_VISION_BASE_URL: str = ""
    OPENAI_VISION_API_KEY: str = ""
    OPENAI_VISION_MODEL: str = "gpt-4o"
    OPENAI_WHISPER_MODEL: str = "whisper-1"
    OPENAI_TTS_MODEL: str = "tts-1"
    OPENAI_TTS_VOICE: str = "alloy"
    
    # 语音 API 专用配置（阿里云百炼标准 API，支持 STT + TTS）
    # 注意：MaaS 工作空间 Key 不支持 STT/TTS，需要使用标准 DashScope API Key
    DASHSCOPE_API_KEY_FOR_VOICE: str = ""
    VOICE_STT_MODEL: str = "paraformer-v2"   # 语音识别模型
    VOICE_TTS_MODEL: str = "cosyvoice-v1"    # 语音合成模型
    VOICE_TTS_VOICE: str = "longxiaochun"    # TTS 声音
    
    # 图像生成配置（阿里云 DashScope 通义万相）
    DASHSCOPE_API_KEY: str = ""
    DASHSCOPE_API_HOST: str = "dashscope.aliyuncs.com"
    IMAGE_GEN_MODEL: str = "wan2.7-image"
    IMAGE_GEN_SIZE: str = "1K"
    IMAGE_GEN_N: int = 1
    
    # 数据库配置
    DATABASE_URL: str = "sqlite+aiosqlite:///./ai_agent_qa.db"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    
    # Redis配置
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 10
    
    # 文件上传配置
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024  # 100MB
    ALLOWED_IMAGE_TYPES: list = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    ALLOWED_VIDEO_TYPES: list = ["video/mp4", "video/webm", "video/avi"]
    ALLOWED_AUDIO_TYPES: list = ["audio/wav", "audio/mp3", "audio/mpeg", "audio/webm"]
    UPLOAD_DIR: str = "uploads"
    
    # CORS配置
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:3001"]
    
    # 安全配置
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    class Config:
        # .env 文件在项目根目录（backend 的上上级目录）
        env_file = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
        case_sensitive = True


# 创建全局配置实例
settings = Settings()
