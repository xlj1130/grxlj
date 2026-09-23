"""
文件上传路由
处理图像、音频、视频等文件的上传
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Optional
import os
import uuid
import logging
import aiofiles

from ....config.settings import settings
from ....db.schemas import UploadResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# 文件类型映射
CONTENT_TYPE_MAP = {
    "image/jpeg": "images",
    "image/png": "images",
    "image/gif": "images",
    "image/webp": "images",
    "video/mp4": "videos",
    "video/webm": "videos",
    "video/avi": "videos",
    "audio/wav": "audio",
    "audio/mp3": "audio",
    "audio/mpeg": "audio",
    "audio/webm": "audio",
}


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...)
):
    """
    上传文件
    
    支持图像、音频、视频文件的上传
    """
    try:
        # 验证文件类型
        content_type = file.content_type or ""
        if content_type not in CONTENT_TYPE_MAP:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件类型: {content_type}。支持: {list(CONTENT_TYPE_MAP.keys())}"
            )
        
        # 读取文件内容
        file_data = await file.read()
        
        # 验证文件大小
        if len(file_data) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"文件过大，最大允许 {settings.MAX_UPLOAD_SIZE // (1024*1024)}MB"
            )
        
        # 确定存储子目录
        sub_dir = CONTENT_TYPE_MAP[content_type]
        upload_path = os.path.join(settings.UPLOAD_DIR, sub_dir)
        os.makedirs(upload_path, exist_ok=True)
        
        # 生成唯一文件名
        ext = os.path.splitext(file.filename or "")[1] or ".bin"
        unique_name = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(upload_path, unique_name)
        
        # 保存文件
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_data)
        
        file_url = f"/uploads/{sub_dir}/{unique_name}"
        
        logger.info(f"文件已上传: {file_path} ({len(file_data)} bytes)")
        
        return UploadResponse(
            file_path=file_path,
            file_url=file_url,
            file_size=len(file_data),
            content_type=content_type
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"文件上传失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@router.post("/upload/audio", response_model=UploadResponse)
async def upload_audio(
    file: UploadFile = File(...)
):
    """专门上传音频文件"""
    if file.content_type not in settings.ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的音频类型: {file.content_type}"
        )
    return await upload_file(file)


@router.post("/upload/image", response_model=UploadResponse)
async def upload_image(
    file: UploadFile = File(...)
):
    """专门上传图像文件"""
    if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的图像类型: {file.content_type}"
        )
    return await upload_file(file)
