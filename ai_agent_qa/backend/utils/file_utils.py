"""
文件处理工具函数
提供文件类型检测、路径处理等功能
"""
import os
import mimetypes
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# 文件类型分类
FILE_CATEGORIES = {
    "image": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"],
    "audio": [".wav", ".mp3", ".mpeg", ".m4a", ".ogg", ".flac", ".webm"],
    "video": [".mp4", ".webm", ".avi", ".mov", ".mkv", ".wmv"],
    "document": [".pdf", ".doc", ".docx", ".txt", ".md", ".csv", ".xlsx"],
}


def get_file_category(filename: str) -> str:
    """
    根据文件名判断类别
    
    Args:
        filename: 文件名
        
    Returns:
        文件类别 (image/audio/video/document/other)
    """
    ext = os.path.splitext(filename)[1].lower()
    for category, extensions in FILE_CATEGORIES.items():
        if ext in extensions:
            return category
    return "other"


def get_content_type(filename: str) -> str:
    """
    根据文件名获取 MIME 类型
    
    Args:
        filename: 文件名
        
    Returns:
        MIME 类型字符串
    """
    content_type, _ = mimetypes.guess_type(filename)
    return content_type or "application/octet-stream"


def ensure_directory(path: str):
    """确保目录存在"""
    os.makedirs(path, exist_ok=True)


def safe_filename(filename: str) -> str:
    """
    生成安全文件名（移除危险字符）
    
    Args:
        filename: 原始文件名
        
    Returns:
        安全的文件名
    """
    # 移除路径分隔符和特殊字符
    safe = os.path.basename(filename)
    safe = "".join(c for c in safe if c.isalnum() or c in "._- ")
    return safe or "unnamed_file"


def format_file_size(size_bytes: int) -> str:
    """
    格式化文件大小显示
    
    Args:
        size_bytes: 文件大小（字节）
        
    Returns:
        格式化的大小字符串
    """
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"
