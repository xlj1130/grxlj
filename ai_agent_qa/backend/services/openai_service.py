"""
OpenAI API服务封装
提供与OpenAI API交互的封装方法
"""
import openai
from typing import List, Dict, Any, Optional, AsyncGenerator
import base64
import io
import json
import httpx
from ..config.settings import settings
import logging

logger = logging.getLogger(__name__)


class OpenAIService:
    """OpenAI API服务类"""
    
    def __init__(self):
        """初始化OpenAI客户端"""
        # 文本对话客户端
        client_kwargs = {
            "api_key": settings.OPENAI_API_KEY,
            "timeout": 120.0,
            "max_retries": 2
        }
        if settings.OPENAI_BASE_URL:
            client_kwargs["base_url"] = settings.OPENAI_BASE_URL
        self.client = openai.AsyncOpenAI(**client_kwargs)
        self.model = settings.OPENAI_MODEL
        
        # Vision 专用客户端（可使用不同的 API）
        vision_api_key = settings.OPENAI_VISION_API_KEY or settings.OPENAI_API_KEY
        vision_base_url = settings.OPENAI_VISION_BASE_URL or settings.OPENAI_BASE_URL
        vision_client_kwargs = {
            "api_key": vision_api_key,
            "timeout": 120.0,
            "max_retries": 2
        }
        if vision_base_url:
            vision_client_kwargs["base_url"] = vision_base_url
        self.vision_client = openai.AsyncOpenAI(**vision_client_kwargs)
        
        self.vision_model = settings.OPENAI_VISION_MODEL
        self.whisper_model = settings.OPENAI_WHISPER_MODEL
        self.tts_model = settings.OPENAI_TTS_MODEL
        self.tts_voice = settings.OPENAI_TTS_VOICE
        logger.info(f"OpenAI client initialized: base_url={settings.OPENAI_BASE_URL or 'default'}, model={self.model}")
        logger.info(f"Vision client initialized: base_url={vision_base_url or 'default'}, model={self.vision_model}, api_key=...{vision_api_key[-6:]}")
        
        # 语音专用配置（阿里云百炼标准 API，支持 STT + TTS）
        self.dashscope_api_key_for_voice = settings.DASHSCOPE_API_KEY_FOR_VOICE
        self.voice_stt_model = settings.VOICE_STT_MODEL  # paraformer-v2
        self.voice_tts_model = settings.VOICE_TTS_MODEL  # cosyvoice-v1
        self.voice_tts_voice = settings.VOICE_TTS_VOICE  # longxiaochun
        
        if self.dashscope_api_key_for_voice:
            logger.info(f"语音 API 已配置：STT={self.voice_stt_model}, TTS={self.voice_tts_model}, api_key=...{self.dashscope_api_key_for_voice[-6:]}")
        else:
            logger.warning("未配置 DASHSCOPE_API_KEY_FOR_VOICE，语音功能将不可用。请前往 https://bailian.console.aliyun.com/ 获取标准 API Key")
    
    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        max_tokens: int = 1000,
        temperature: float = 0.7,
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        文本聊天完成
        
        Args:
            messages: 消息列表
            max_tokens: 最大token数
            temperature: 温度参数
            tools: 可用工具列表
            
        Returns:
            响应字典
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                tools=tools if tools else None
            )
            
            return {
                "content": response.choices[0].message.content,
                "tool_calls": response.choices[0].message.tool_calls if response.choices[0].message.tool_calls else [],
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                }
            }
        except Exception as e:
            logger.error(f"Chat completion error: {str(e)}")
            raise
    
    async def vision_chat(
        self,
        messages: List[Dict[str, Any]],
        image_url: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        视觉聊天完成（支持图像输入）
        
        Args:
            messages: 消息列表（已包含图像内容时直接使用）
            image_url: 图像URL或base64编码（当messages未包含图像时使用）
            max_tokens: 最大token数
            temperature: 温度参数
            
        Returns:
            响应字典
        """
        try:
            # 检查 messages 最后一条是否已经是多模态格式（列表）
            last_msg_content = messages[-1].get("content", "")
            if isinstance(last_msg_content, list):
                # messages 已经包含了正确的图像+文本结构，直接使用
                pass
            elif image_url:
                # 需要手动构建多模态消息
                if image_url.startswith("data:"):
                    image_content = image_url
                else:
                    image_content = image_url
                
                messages[-1]["content"] = [
                    {"type": "text", "text": messages[-1]["content"]},
                    {"type": "image_url", "image_url": {"url": image_content}}
                ]
            
            response = await self.vision_client.chat.completions.create(
                model=self.vision_model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            
            return {
                "content": response.choices[0].message.content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                }
            }
        except Exception as e:
            logger.error(f"Vision chat error: {str(e)}")
            raise
    
    async def audio_to_text(
        self,
        audio_file: bytes,
        filename: str = "audio.webm"
    ) -> str:
        """
        音频转文本（STT）- 使用阿里云百炼标准 API（OpenAI 兼容模式）
            
        Args:
            audio_file: 音频文件字节数据
            filename: 文件名
                
        Returns:
            转录文本
        """
        try:
            # 使用阿里云百炼标准 API（OpenAI 兼容模式）
            if self.dashscope_api_key_for_voice:
                import io
                
                # 阿里云百炼标准 API 端点（OpenAI 兼容模式）
                url = "https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions"
                headers = {
                    "Authorization": f"Bearer {self.dashscope_api_key_for_voice}"
                }
                
                # 构建 multipart/form-data 请求
                data = {
                    "model": self.voice_stt_model,
                }
                files = {
                    "file": (filename, io.BytesIO(audio_file), "audio/webm")
                }
                
                logger.info(f"DashScope STT 请求：model={self.voice_stt_model}, size={len(audio_file)} bytes")
                
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(url, headers=headers, data=data, files=files)
                    
                    if resp.status_code != 200:
                        error_text = resp.text
                        logger.error(f"DashScope STT 请求失败：{resp.status_code} {error_text}")
                        raise Exception(f"STT 请求失败 ({resp.status_code}): {error_text}")
                    
                    result = resp.json()
                    text = result.get("text", "")
                    logger.info(f"STT 成功：转录文本长度={len(text)}")
                    return text
            
            # Fallback：使用主客户端（DeepSeek 等，但 DeepSeek 不支持 STT）
            logger.warning("未配置语音 API，尝试使用主客户端")
            raise Exception("未配置 DASHSCOPE_API_KEY_FOR_VOICE，无法进行 STT 转换。请前往 https://bailian.console.aliyun.com/ 获取标准 API Key")
                    
        except Exception as e:
            logger.error(f"Audio to text error: {str(e)}", exc_info=True)
            raise
    
    async def text_to_speech(
        self,
        text: str,
        voice: Optional[str] = None,
        output_format: str = "mp3"
    ) -> bytes:
        """
        文字转语音（TTS）- 使用阿里云百炼标准 API（OpenAI 兼容模式）
            
        Args:
            text: 要转换的文本
            voice: 语音类型
            output_format: 输出格式
                
        Returns:
            音频文件字节数据
        """
        try:
            voice = voice or self.voice_tts_voice
                
            # 使用阿里云百炼标准 API（OpenAI 兼容模式）
            if self.dashscope_api_key_for_voice:
                # 阿里云百炼标准 API 端点（OpenAI 兼容模式）
                url = "https://dashscope.aliyuncs.com/compatible-mode/v1/audio/speech"
                headers = {
                    "Authorization": f"Bearer {self.dashscope_api_key_for_voice}",
                    "Content-Type": "application/json"
                }
                
                payload = {
                    "model": self.voice_tts_model,
                    "input": text,
                    "voice": voice,
                    "response_format": output_format
                }
                
                logger.info(f"DashScope TTS 请求：model={self.voice_tts_model}, voice={voice}, text 长度={len(text)}")
                
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    
                    if resp.status_code != 200:
                        error_text = resp.text
                        logger.error(f"DashScope TTS 请求失败：{resp.status_code} {error_text}")
                        raise Exception(f"TTS 请求失败 ({resp.status_code}): {error_text}")
                    
                    # 检查响应是否是音频数据
                    content_type = resp.headers.get("content-type", "")
                    if "audio" in content_type or "octet-stream" in content_type:
                        audio_bytes = resp.content
                        logger.info(f"TTS 成功：音频大小={len(audio_bytes)} bytes")
                        return audio_bytes
                    else:
                        # 可能是 JSON 响应
                        result = resp.json()
                        logger.info(f"DashScope TTS 响应：{json.dumps(result, ensure_ascii=False)[:200]}")
                        raise Exception(f"TTS 响应格式异常：{result}")
            
            raise Exception("未配置 DASHSCOPE_API_KEY_FOR_VOICE，无法进行 TTS 转换。请前往 https://bailian.console.aliyun.com/ 获取标准 API Key")
                            
        except Exception as e:
            logger.error(f"Text to speech error: {str(e)}", exc_info=True)
            raise
    
    async def stream_chat(
        self,
        messages: List[Dict[str, Any]],
        max_tokens: int = 1000,
        temperature: float = 0.7
    ) -> AsyncGenerator[str, None]:
        """
        流式聊天完成
        
        Args:
            messages: 消息列表
            max_tokens: 最大token数
            temperature: 温度参数
            
        Yields:
            响应文本块
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True
            )
            
            for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.error(f"Stream chat error: {str(e)}")
            raise
    
    async def generate_image(
        self,
        prompt: str,
        reference_image_url: Optional[str] = None,
        size: Optional[str] = None,
        n: int = 1
    ) -> Dict[str, Any]:
        """
        生成图片（支持文生图和图生图）
        使用阿里云百炼万相 2.7 API
        
        Args:
            prompt: 图片描述提示词
            reference_image_url: 参考图片URL（图生图模式）
            size: 图片尺寸，如 "1K", "2K"
            n: 生成图片数量
            
        Returns:
            生成结果，包含图片URL列表
        """
        # 图像生成专用 Key（不要 fallback 到 vision key，因为不同工作空间）
        api_key = settings.DASHSCOPE_API_KEY
        if not api_key:
            return {"success": False, "error": "未配置 DASHSCOPE_API_KEY（图像生成需要独立的 API Key）"}
        
        api_host = settings.DASHSCOPE_API_HOST or "dashscope.aliyuncs.com"
        # 同步调用端点（推荐）
        url = f"https://{api_host}/api/v1/services/aigc/multimodal-generation/generation"
        
        logger.info(f"图像生成配置: api_host={api_host}, model={settings.IMAGE_GEN_MODEL}, api_key=...{api_key[-10:]}")
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # 构建 messages 格式的请求体（万相 2.7 格式）
        content_list: List[Dict[str, Any]] = [{"text": prompt}]
        
        # 图生图：添加参考图片
        if reference_image_url:
            if reference_image_url.startswith("data:"):
                content_list.insert(0, {"image": reference_image_url})
            elif reference_image_url.startswith("http://") or reference_image_url.startswith("https://"):
                content_list.insert(0, {"image": reference_image_url})
            else:
                # 本地文件路径，转为 base64
                ref_b64 = self._local_file_to_base64_data_uri(reference_image_url)
                if ref_b64:
                    content_list.insert(0, {"image": ref_b64})
                else:
                    return {"success": False, "error": "无法读取参考图片"}
        
        # 转换尺寸格式：1024*1024 -> 1K, 2048*2048 -> 2K
        size_param = self._convert_size_to_wanx(size or settings.IMAGE_GEN_SIZE)
        
        payload: Dict[str, Any] = {
            "model": settings.IMAGE_GEN_MODEL,
            "input": {
                "messages": [
                    {
                        "role": "user",
                        "content": content_list
                    }
                ]
            },
            "parameters": {
                "size": size_param,
                "n": n,
                "watermark": False
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                logger.info(f"图像生成请求: status={resp.status_code}, url={url}, model={settings.IMAGE_GEN_MODEL}")
                
                if resp.status_code != 200:
                    error_text = resp.text
                    logger.error(f"图像生成请求失败: {resp.status_code} {error_text}")
                    return {"success": False, "error": f"请求失败 ({resp.status_code}): {error_text}"}
                
                result_data = resp.json()
                logger.info(f"图像生成响应: {json.dumps(result_data, ensure_ascii=False)[:500]}")
                
                # 解析响应：output.choices[].message.content[].image
                choices = result_data.get("output", {}).get("choices", [])
                image_urls = []
                
                for choice in choices:
                    message = choice.get("message", {})
                    content_items = message.get("content", [])
                    for item in content_items:
                        if item.get("type") == "image":
                            img_url = item.get("image", "")
                            if img_url:
                                image_urls.append(img_url)
                
                if image_urls:
                    return {
                        "success": True,
                        "image_urls": image_urls,
                        "prompt": prompt,
                        "mode": "image_to_image" if reference_image_url else "text_to_image"
                    }
                else:
                    # 检查是否有错误
                    code = result_data.get("code", "")
                    message = result_data.get("message", "")
                    if code:
                        return {"success": False, "error": f"{code}: {message}"}
                    return {"success": False, "error": f"图像生成未返回图片: {result_data}"}
                
        except Exception as e:
            logger.error(f"图像生成失败: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def _convert_size_to_wanx(self, size: str) -> str:
        """将尺寸格式转换为万相 API 格式
        1024*1024 -> 1K, 2048*2048 -> 2K, 4096*4096 -> 4K
        如果不是标准尺寸，直接返回原值
        """
        size_map = {
            "1024*1024": "1K",
            "2048*2048": "2K",
            "4096*4096": "4K",
        }
        return size_map.get(size, size)
    

    
    def _local_file_to_base64_data_uri(self, file_path: str) -> Optional[str]:
        """将本地文件路径转为 base64 数据 URI，统一压缩所有图片"""
        try:
            import os
            from PIL import Image
            
            abs_path = file_path
            if not os.path.isabs(abs_path):
                if abs_path.startswith("/"):
                    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                    abs_path = os.path.join(project_root, abs_path.lstrip("/"))
                else:
                    abs_path = os.path.abspath(abs_path)
            
            logger.info(f"尝试读取文件: {abs_path}")
            if not os.path.isfile(abs_path):
                logger.warning(f"文件不存在: {abs_path}")
                return None
            
            file_size = os.path.getsize(abs_path)
            logger.info(f"原始图片文件大小: {file_size / 1024:.1f} KB")
            
            # 统一通过 PIL 处理：缩放 + 转 JPEG
            img = Image.open(abs_path)
            logger.info(f"原始图片尺寸: {img.size}, 模式: {img.mode}")
            
            # 等比缩放，最大边长 1024px
            max_dim = max(img.size)
            if max_dim > 1024:
                ratio = 1024 / max_dim
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.LANCZOS)
                logger.info(f"缩放后尺寸: {img.size}")
            
            # 统一转为 RGB JPEG
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if 'A' in img.mode else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=85, optimize=True)
            encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
            result_size = len(buffer.getvalue())
            logger.info(f"压缩后: {result_size / 1024:.1f} KB")
            
            return f"data:image/jpeg;base64,{encoded}"
        except Exception as e:
            logger.error(f"文件转base64失败: {str(e)}")
            return None


# 创建全局服务实例
openai_service = OpenAIService()
