"""
图像生成工具
使用阿里云 DashScope（通义万相）生成图片，支持文生图和图生图
"""
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class ImageGeneratorTool:
    """图像生成工具"""

    name = "image_generator"
    description = "根据文字描述生成图片，或根据参考图片生成类似风格的图片。支持文生图和图生图两种模式。"

    def __init__(self):
        from ...services.openai_service import openai_service
        self.openai_service = openai_service

    async def execute(
        self,
        prompt: str,
        reference_image_url: Optional[str] = None,
        size: Optional[str] = None,
        n: int = 1
    ) -> Dict[str, Any]:
        """
        生成图片

        Args:
            prompt: 图片描述提示词（中英文均可）
            reference_image_url: 参考图片URL或本地路径（图生图模式）
            size: 图片尺寸，如 "1024*1024"、"720*1280"、"1280*720"
            n: 生成图片数量（1-4）

        Returns:
            生成结果
        """
        try:
            if not prompt or not prompt.strip():
                return {"error": "请提供图片描述", "success": False}

            result = await self.openai_service.generate_image(
                prompt=prompt.strip(),
                reference_image_url=reference_image_url,
                size=size,
                n=n
            )

            return result
        except Exception as e:
            logger.error(f"图像生成失败: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

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
                        "prompt": {
                            "type": "string",
                            "description": "图片描述提示词，详细描述你想要生成的图片内容、风格、色调等"
                        },
                        "reference_image_url": {
                            "type": "string",
                            "description": "参考图片的URL或本地文件路径（图生图模式，可选）。提供后会生成与参考图风格类似的图片"
                        },
                        "size": {
                            "type": "string",
                            "description": "图片尺寸，格式为 宽*高，如 1024*1024、720*1280、1280*720",
                            "default": "1024*1024"
                        },
                        "n": {
                            "type": "integer",
                            "description": "生成图片数量，1-4之间",
                            "default": 1
                        }
                    },
                    "required": ["prompt"]
                }
            }
        }
