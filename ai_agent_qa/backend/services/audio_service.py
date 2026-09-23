"""
音频处理服务
提供音频录制、转换和处理功能
"""
import io
import os
import tempfile
from typing import Optional
import logging
import aiofiles
from ..config.settings import settings

logger = logging.getLogger(__name__)


class AudioService:
    """音频处理服务类"""
    
    def __init__(self):
        """初始化音频服务"""
        self.upload_dir = settings.UPLOAD_DIR
        self.max_upload_size = settings.MAX_UPLOAD_SIZE
        self.allowed_audio_types = settings.ALLOWED_AUDIO_TYPES
        # 确保上传目录存在
        os.makedirs(self.upload_dir, exist_ok=True)
        os.makedirs(os.path.join(self.upload_dir, "audio"), exist_ok=True)
    
    async def save_audio_file(
        self,
        audio_data: bytes,
        filename: str,
        content_type: str
    ) -> dict:
        """
        保存音频文件到磁盘
        
        Args:
            audio_data: 音频文件字节数据
            filename: 原始文件名
            content_type: MIME类型
            
        Returns:
            包含文件路径和元信息的字典
        """
        try:
            # 验证文件类型
            if content_type not in self.allowed_audio_types:
                raise ValueError(f"不支持的音频类型: {content_type}")
            
            # 验证文件大小
            if len(audio_data) > self.max_upload_size:
                raise ValueError(f"音频文件过大，最大允许 {self.max_upload_size} 字节")
            
            # 生成唯一文件名
            import uuid
            ext = os.path.splitext(filename)[1] or ".mp3"
            unique_filename = f"{uuid.uuid4()}{ext}"
            file_path = os.path.join(self.upload_dir, "audio", unique_filename)
            
            # 异步写入文件
            async with aiofiles.open(file_path, "wb") as f:
                await f.write(audio_data)
            
            file_url = f"/uploads/audio/{unique_filename}"
            
            logger.info(f"音频文件已保存: {file_path}")
            
            return {
                "file_path": file_path,
                "file_url": file_url,
                "file_size": len(audio_data),
                "content_type": content_type,
                "filename": unique_filename
            }
        except Exception as e:
            logger.error(f"保存音频文件失败: {str(e)}")
            raise
    
    @staticmethod
    def get_audio_duration_estimate(file_size: int, bitrate: int = 128) -> float:
        """
        根据文件大小估算音频时长（秒）
        
        Args:
            file_size: 文件大小（字节）
            bitrate: 比特率（kbps）
            
        Returns:
            估算时长（秒）
        """
        # bitrate in kbps -> bytes per second
        bytes_per_second = (bitrate * 1000) / 8
        if bytes_per_second == 0:
            return 0.0
        return file_size / bytes_per_second
    
    @staticmethod
    async def convert_audio_format(
        audio_data: bytes,
        source_format: str,
        target_format: str = "mp3"
    ) -> bytes:
        """
        转换音频格式（需要 ffmpeg）
        
        Args:
            audio_data: 原始音频数据
            source_format: 源格式
            target_format: 目标格式
            
        Returns:
            转换后的音频数据
        """
        import asyncio
        
        with tempfile.NamedTemporaryFile(suffix=f".{source_format}", delete=False) as src:
            src.write(audio_data)
            src_path = src.name
        
        dst_path = src_path.replace(f".{source_format}", f".{target_format}")
        
        try:
            # 使用 ffmpeg 转换
            process = await asyncio.create_subprocess_exec(
                "ffmpeg", "-i", src_path, "-y", dst_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await process.communicate()
            
            if process.returncode != 0:
                raise RuntimeError("ffmpeg 转换失败")
            
            async with aiofiles.open(dst_path, "rb") as f:
                converted_data = await f.read()
            
            return converted_data
        finally:
            # 清理临时文件
            for path in [src_path, dst_path]:
                if os.path.exists(path):
                    os.remove(path)


# 创建全局服务实例
audio_service = AudioService()
