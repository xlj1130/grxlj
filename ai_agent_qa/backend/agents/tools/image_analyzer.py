"""图像分析工具
使用 OpenAI Vision 模型分析图像内容
"""
from typing import Dict, Any, Optional
import base64
import logging
import os
import io

logger = logging.getLogger(__name__)

# 阿里云 VL 模型对 base64 图片的大小限制
# 统一压缩策略：所有图片都处理，确保不超过 API 限制
MAX_IMAGE_DIMENSION = 1024  # 最大边长（视觉分析足够）
JPEG_QUALITY = 85  # JPEG 压缩质量


class ImageAnalyzerTool:
    """图像分析工具"""

    name = "image_analyzer"
    description = "分析图像内容，描述图像中的物体、场景、文字等信息。支持 URL 和 base64 格式。"

    def __init__(self):
        from ...services.openai_service import openai_service
        self.openai_service = openai_service
        # 获取项目根目录（ai_agent_qa 目录）
        # 当前文件路径: ai_agent_qa/backend/agents/tools/image_analyzer.py
        # 需要向上3层: tools -> agents -> backend -> ai_agent_qa
        self.project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

    async def execute(
        self,
        image_url: Optional[str] = None,
        image_base64: Optional[str] = None,
        question: str = "请详细描述这张图像的内容"
    ) -> Dict[str, Any]:
        """
        分析图像内容

        Args:
            image_url: 图像URL或本地文件路径
            image_base64: base64编码的图像
            question: 关于图像的问题

        Returns:
            分析结果
        """
        try:
            image_content = None

            if image_base64:
                image_content = f"data:image/jpeg;base64,{image_base64}"
            elif image_url:
                if image_url.startswith("data:"):
                    image_content = image_url
                elif image_url.startswith("http://") or image_url.startswith("https://"):
                    image_content = image_url
                else:
                    image_content = self._local_file_to_base64(image_url)
            else:
                return {"error": "必须提供 image_url 或 image_base64"}

            if not image_content:
                return {"error": "无法解析图像内容"}

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": question},
                        {"type": "image_url", "image_url": {"url": image_content}}
                    ]
                }
            ]

            result = await self.openai_service.vision_chat(
                messages=messages,
                image_url=image_content
            )

            return {
                "analysis": result["content"],
                "question": question,
                "success": True
            }
        except Exception as e:
            logger.error(f"图像分析失败: {str(e)}")
            return {
                "analysis": None,
                "success": False,
                "error": str(e)
            }

    def _local_file_to_base64(self, file_path: str) -> Optional[str]:
        """将本地文件路径转为 base64 数据 URI，统一压缩所有图片"""
        try:
            from PIL import Image
            
            abs_path = file_path
                
            logger.debug(f"原始 file_path: {file_path}")
            logger.debug(f"project_root: {self.project_root}")
                
            # 如果是相对路径(以 /uploads 开头),拼接项目根目录
            if not os.path.isabs(abs_path):
                if abs_path.startswith("/"):
                    abs_path = os.path.join(self.project_root, abs_path.lstrip("/"))
                else:
                    abs_path = os.path.abspath(abs_path)
                
            logger.debug(f"计算后的 abs_path: {abs_path}")

            if not os.path.isfile(abs_path):
                logger.error(f"文件不存在: {abs_path}")
                return None

            file_size = os.path.getsize(abs_path)
            logger.info(f"原始图片文件大小: {file_size / 1024:.1f} KB")

            # 统一通过 PIL 处理：缩放 + 转 JPEG，确保所有图片都符合 API 限制
            img = Image.open(abs_path)
            logger.info(f"原始图片尺寸: {img.size}, 模式: {img.mode}")
            
            # 如果尺寸过大，等比缩放
            max_dim = max(img.size)
            if max_dim > MAX_IMAGE_DIMENSION:
                ratio = MAX_IMAGE_DIMENSION / max_dim
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.LANCZOS)
                logger.info(f"缩放后尺寸: {img.size}")
            
            # 统一转为 RGB JPEG（PNG/RGBA 等格式体积大，JPEG 足够用于视觉分析）
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if 'A' in img.mode else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # 编码为 JPEG
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=JPEG_QUALITY, optimize=True)
            encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
            result_size = len(buffer.getvalue())
            logger.info(f"压缩后: {result_size / 1024:.1f} KB, quality={JPEG_QUALITY}")
            
            return f"data:image/jpeg;base64,{encoded}"
        except Exception as e:
            logger.error(f"文件转base64失败: {str(e)}")
            return None

    def get_tool_schema(self) -> Dict[str, Any]:
        """获取工具的 OpenAI function calling schema"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "image_url": {
                            "type": "string",
                            "description": "图像的URL地址或本地文件路径"
                        },
                        "image_base64": {
                            "type": "string",
                            "description": "base64编码的图像数据"
                        },
                        "question": {
                            "type": "string",
                            "description": "关于图像的问题",
                            "default": "请详细描述这张图像的内容"
                        }
                    },
                    "required": []
                }
            }
        }
