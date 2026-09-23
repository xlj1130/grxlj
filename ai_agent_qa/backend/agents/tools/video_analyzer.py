"""
视频分析工具
从视频中提取关键帧并调用 Vision API 进行分析
"""
from typing import Dict, Any, Optional, List
import base64
import logging
import os
import cv2
import numpy as np

logger = logging.getLogger(__name__)


class VideoAnalyzerTool:
    """视频分析工具"""

    name = "video_analyzer"
    description = "分析视频内容，提取关键帧并描述视频中的场景、物体、动作等信息。支持 MP4、WEBM、AVI 等格式。"

    def __init__(self):
        from ...services.openai_service import openai_service
        self.openai_service = openai_service
        # 获取项目根目录（ai_agent_qa 目录）
        self.project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

    async def execute(
        self,
        video_path: str,
        question: str = "请详细描述这个视频的内容，包括场景、人物、动作等"
    ) -> Dict[str, Any]:
        """
        分析视频内容

        Args:
            video_path: 视频文件路径（相对或绝对路径）
            question: 关于视频的问题

        Returns:
            分析结果
        """
        try:
            # 1. 解析视频路径
            abs_path = self._resolve_path(video_path)
            if not abs_path or not os.path.isfile(abs_path):
                return {"error": f"视频文件不存在: {abs_path}", "success": False}

            logger.info(f"开始分析视频: {abs_path}")

            # 2. 提取关键帧
            frames = self._extract_key_frames(abs_path)
            if not frames:
                return {"error": "无法从视频中提取关键帧", "success": False}

            logger.info(f"提取了 {len(frames)} 个关键帧")

            # 3. 将关键帧转为 base64
            frame_base64_list = []
            for i, frame in enumerate(frames):
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                encoded = base64.b64encode(buffer.tobytes()).decode('utf-8')
                frame_base64_list.append(f"data:image/jpeg;base64,{encoded}")

            # 4. 构建多模态消息
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": question},
                    ]
                }
            ]

            # 添加所有关键帧
            for frame_b64 in frame_base64_list:
                messages[0]["content"].append({
                    "type": "image_url",
                    "image_url": {"url": frame_b64}
                })

            # 5. 调用 Vision API
            result = await self.openai_service.vision_chat(
                messages=messages,
                image_url=None  # 不使用单个图片，使用 messages 中的多张图片
            )

            return {
                "analysis": result["content"],
                "question": question,
                "frames_count": len(frames),
                "success": True
            }

        except Exception as e:
            logger.error(f"视频分析失败: {str(e)}", exc_info=True)
            return {
                "analysis": None,
                "success": False,
                "error": str(e)
            }

    def _resolve_path(self, file_path: str) -> Optional[str]:
        """解析文件路径，支持相对路径和绝对路径"""
        try:
            abs_path = file_path
            
            # 如果是相对路径（以 /uploads 开头），拼接项目根目录
            if not os.path.isabs(abs_path):
                if abs_path.startswith("/"):
                    # 去掉开头的 /，拼接到项目根目录
                    abs_path = os.path.join(self.project_root, abs_path.lstrip("/"))
                else:
                    abs_path = os.path.abspath(abs_path)

            return abs_path
        except Exception as e:
            logger.error(f"路径解析失败: {str(e)}")
            return None

    def _extract_key_frames(self, video_path: str) -> List[np.ndarray]:
        """
        从视频中提取关键帧
        
        策略：
        - 第 1 秒的帧
        - 中间的帧
        - 最后 1 秒的帧
        
        Returns:
            关键帧列表（numpy 数组）
        """
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                logger.error(f"无法打开视频文件: {video_path}")
                return []

            # 获取视频信息
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = total_frames / fps if fps > 0 else 0

            logger.debug(f"视频信息: FPS={fps}, 总帧数={total_frames}, 时长={duration:.2f}s")

            key_frames = []

            # 定义要提取的帧位置（秒）
            if duration >= 3:
                target_seconds = [1.0, duration / 2, duration - 1.0]
            elif duration >= 1:
                target_seconds = [0.5, duration / 2, duration - 0.5]
            else:
                # 视频太短，只取中间帧
                target_seconds = [duration / 2]

            # 提取每一帧
            for sec in target_seconds:
                frame_idx = int(sec * fps)
                frame_idx = min(frame_idx, total_frames - 1)  # 确保不超出范围
                
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()
                
                if ret and frame is not None:
                    # 调整帧大小（避免过大）
                    h, w = frame.shape[:2]
                    max_size = 1920
                    if max(h, w) > max_size:
                        scale = max_size / max(h, w)
                        new_w = int(w * scale)
                        new_h = int(h * scale)
                        frame = cv2.resize(frame, (new_w, new_h))
                    
                    key_frames.append(frame)
                    logger.debug(f"提取第 {sec}s 的帧 (索引={frame_idx})")

            cap.release()
            return key_frames

        except Exception as e:
            logger.error(f"提取关键帧失败: {str(e)}", exc_info=True)
            return []

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
                        "video_path": {
                            "type": "string",
                            "description": "视频文件的URL地址或本地文件路径"
                        },
                        "question": {
                            "type": "string",
                            "description": "关于视频的问题",
                            "default": "请详细描述这个视频的内容，包括场景、人物、动作等"
                        }
                    },
                    "required": ["video_path"]
                }
            }
        }
