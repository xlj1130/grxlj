"""
AI Agent 核心逻辑
实现 Agent 的推理、工具调用和多模态处理流程
"""
from typing import Dict, Any, Optional, List, AsyncGenerator
import json
import logging
import uuid
from datetime import datetime, timezone

from ..services.openai_service import openai_service
from .memory import conversation_memory
from .tools.web_search import WebSearchTool
from .tools.calculator import CalculatorTool
from .tools.image_analyzer import ImageAnalyzerTool
from .tools.image_generator import ImageGeneratorTool
from .tools.video_analyzer import VideoAnalyzerTool
from ..config.constants import AGENT_STATE_INPUT, AGENT_STATE_PROCESSING, \
    AGENT_STATE_TOOL_CALL, AGENT_STATE_OUTPUT, AGENT_STATE_ERROR

logger = logging.getLogger(__name__)


class Agent:
    """多模态 AI Agent"""
    
    SYSTEM_PROMPT = """你是一个智能多模态 AI 助手，能够通过文本、图像、音频和视频与用户交互。

你的能力：
1. 自然语言对话：理解并回答各种问题
2. 图像分析：分析用户发送的图像内容
3. 图像生成：根据文字描述生成图片，或根据参考图片生成类似风格的图片
4. 音频处理：理解语音消息并生成语音回复
5. 工具使用：可以调用网络搜索和计算器等工具
6. 上下文记忆：记住对话历史，提供连贯的回复

回复原则：
- 用中文回复（除非用户使用其他语言）
- 回复要准确、有帮助、友好
- 当需要实时信息时，主动使用搜索工具
- 当涉及计算时，使用计算器工具确保准确性
- 对图像内容提供详细描述

工具调用规则（极其重要）：
- 当用户要求"生成图片"、"画一张图"、"创建图像"、"帮我生成"、"做一张类似的图"等与图像生成相关的请求时，你必须调用 image_generator 工具
- 如果消息中包含"[用户上传了一张图像]"和"图像文件路径"，说明图像已经被分析过了，你不需要再调用 image_analyzer
- 当用户上传图片并要求生成类似图片时，直接调用 image_generator 工具，将文件路径作为 reference_image_url 参数传入
- 调用 image_generator 工具时，prompt 参数应包含详细的图片描述，包括内容、风格、色调、构图等
- 绝对不要仅用文字描述你"可以"生成图片，必须直接调用 image_generator 工具去生成
- 如果用户要求生成图片，你只能调用 image_generator 工具，不能调用 image_analyzer 或其他工具"""
    
    def __init__(self):
        """初始化 Agent"""
        self.tools = {
            "web_search": WebSearchTool(),
            "calculator": CalculatorTool(),
            "image_analyzer": ImageAnalyzerTool(),
            "image_generator": ImageGeneratorTool(),
            "video_analyzer": VideoAnalyzerTool(),
        }
        self.tool_schemas = [tool.get_tool_schema() for tool in self.tools.values()]
    
    async def process_message(
        self,
        conversation_id: str,
        user_message: str,
        content_type: str = "text",
        file_path: Optional[str] = None,
        file_url: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        处理用户消息
        
        Args:
            conversation_id: 对话ID
            user_message: 用户消息内容
            content_type: 内容类型 (text/image/audio/video)
            file_path: 上传文件路径
            file_url: 文件URL
            metadata: 额外元数据
            
        Returns:
            Agent 响应
        """
        message_id = str(uuid.uuid4())
        
        try:
            # 1. 记录用户消息到记忆
            conversation_memory.add_message(conversation_id, "user", user_message)
            
            # 2. 根据内容类型预处理
            processed_message = user_message
            generated_image_urls: List[str] = []
            
            # 检测是否是图像生成请求
            is_image_gen_request = any(keyword in user_message for keyword in ["生成", "画一张", "创建", "类似", "做一张"])
            logger.info(f"用户消息: '{user_message}', content_type={content_type}, file_url={file_url}, is_image_gen_request={is_image_gen_request}")
            
            if content_type == "image" and file_url:
                # 先分析图像
                logger.info("开始分析图像...")
                processed_message = await self._handle_image_input(file_url, user_message)
                logger.info(f"图像分析完成，processed_message 长度: {len(processed_message)}")
                
                # 如果用户要求生成类似图片，自动调用图像生成工具
                if is_image_gen_request:
                    logger.info("✅ 检测到图像生成请求，开始调用 image_generator...")
                    # 从分析结果中提取描述作为 prompt
                    analysis_result = processed_message.split("图像分析结果:")[-1] if "图像分析结果:" in processed_message else user_message
                    
                    logger.info(f"调用 image_generator, file_url={file_url}")
                    gen_result = await self.tools["image_generator"].execute(
                        prompt=f"根据以下图像描述生成一张类似的图片：{analysis_result[:500]}",
                        reference_image_url=file_url,
                        size="1024*1024",
                        n=1
                    )
                    logger.info(f"image_generator 返回: success={gen_result.get('success')}, keys={list(gen_result.keys())}")
                    
                    if gen_result.get("success"):
                        generated_image_urls = gen_result.get("image_urls", [])
                        logger.info(f"✅ 图像生成成功：{len(generated_image_urls)} 张, urls={generated_image_urls}")
                        # 图片已由 agent 预生成，在消息中明确告知 LLM 不要再调用 image_generator
                        img_url_display = "\n".join([f"- {url}" for url in generated_image_urls])
                        processed_message += f"\n\n[系统提示：agent 已自动为用户生成了类似图片，生成的图片URL如下：\n{img_url_display}\n请在回复中直接展示这些图片并描述生成结果，不要再调用 image_generator 或其他工具。]"
                    else:
                        logger.error(f"❌ 图像生成失败：{gen_result.get('error')}")
                        processed_message += f"\n[图像生成失败：{gen_result.get('error')}]"
                else:
                    logger.info("未检测到图像生成请求，跳过 image_generator")
                    
            elif content_type == "audio" and (file_path or file_url):
                logger.info(f" 检测到音频消息：file_path={file_path}, file_url={file_url}")
                # 优先使用 file_path，否则从 file_url 转换
                audio_file_path = file_path
                if not audio_file_path and file_url:
                    # 将 /uploads/audio/xxx.webm 转换为本地路径
                    import os
                    # file_url 已经是相对于项目根目录的路径（如 /uploads/audio/xxx.webm）
                    # 需要获取项目根目录（backend 的上两级目录）
                    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                    audio_file_path = os.path.join(project_root, file_url.lstrip("/"))
                    logger.info(f" 转换文件路径：{audio_file_path}")
                
                if audio_file_path:
                    logger.info(f"🎤 开始处理音频：{audio_file_path}")
                    processed_message = await self._handle_audio_input(audio_file_path)
                    logger.info(f"🎤 音频处理结果：{processed_message[:100] if processed_message else 'None'}")
                    # 更新对话记忆中的用户消息为转录文本
                    if processed_message and not processed_message.startswith("[语音消息处理失败"):
                        conversation_memory.messages[conversation_id][-1]["content"] = processed_message
                        user_message = processed_message  # 更新 user_message 用于后续处理
                else:
                    logger.error(f" 无法找到音频文件路径：file_path={file_path}, file_url={file_url}")
                    processed_message = "[语音消息处理失败：无法找到音频文件路径]"
            elif content_type == "video" and file_url:
                processed_message = await self._handle_video_input(file_url, user_message)
            
            # 3. 构建 LLM 消息列表
            llm_messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]
            llm_messages.extend(
                conversation_memory.get_messages_for_llm(conversation_id, limit=20)
            )
            # 替换最后一条用户消息为处理后的版本
            if processed_message != user_message:
                llm_messages[-1]["content"] = processed_message
            
            # 4. 调用 LLM（支持工具调用）
            response = await self._call_llm_with_tools(llm_messages)
            
            # 5. 处理工具调用
            if response.get("tool_calls"):
                tool_results = await self._execute_tool_calls(response["tool_calls"])
                
                # 将工具结果添加到上下文，再次调用 LLM
                llm_messages.append({
                    "role": "assistant",
                    "content": response.get("content", ""),
                    "tool_calls": response["tool_calls"]
                })
                
                for result in tool_results:
                    # 收集图片生成工具的结果
                    if result["tool_name"] == "image_generator" and result["output"].get("success"):
                        generated_image_urls = result["output"].get("image_urls", [])
                    
                    llm_messages.append({
                        "role": "tool",
                        "tool_call_id": result["tool_call_id"],
                        "content": json.dumps(result["output"], ensure_ascii=False)
                    })
                
                # 再次调用获取最终回复
                final_response = await openai_service.chat_completion(
                    messages=llm_messages,
                    max_tokens=2000
                )
                assistant_message = final_response["content"]
            else:
                assistant_message = response.get("content", "抱歉，我无法生成回复。")
            
            # 6. 记录 Agent 回复到记忆
            conversation_memory.add_message(conversation_id, "assistant", assistant_message)
            
            # 将 usage 对象转为纯 dict（避免 Pydantic 序列化问题）
            usage_data = response.get("usage")
            if usage_data and hasattr(usage_data, 'model_dump'):
                usage_data = usage_data.model_dump()
            elif usage_data and hasattr(usage_data, 'dict'):
                usage_data = usage_data.dict()
            
            # 确保所有 metadata 值都是 JSON 可序列化的
            metadata = {
                "tool_calls": len(response.get("tool_calls", [])),
                "usage": usage_data,
                "generated_image_urls": generated_image_urls
            }
            
            # 验证 metadata 可序列化
            try:
                json.dumps(metadata, ensure_ascii=False)
            except (TypeError, ValueError) as e:
                logger.error(f"metadata 不可序列化: {e}, metadata={metadata}")
                # 移除不可序列化的字段
                metadata = {
                    "tool_calls": len(response.get("tool_calls", [])),
                    "generated_image_urls": generated_image_urls
                }
            
            return {
                "conversation_id": conversation_id,
                "message_id": message_id,
                "response": assistant_message,
                "content_type": "image" if generated_image_urls else "text",
                "timestamp": datetime.now(timezone.utc),
                "metadata": metadata
            }
            
        except Exception as e:
            logger.error(f"处理消息失败: {str(e)}", exc_info=True)
            error_message = f"处理消息时出错: {str(e)}"
            return {
                "conversation_id": conversation_id,
                "message_id": message_id,
                "response": error_message,
                "content_type": "text",
                "timestamp": datetime.now(timezone.utc),
                "metadata": {
                    "tool_calls": 0,
                    "usage": None,
                    "generated_image_urls": [],
                    "error": str(e)
                },
                "status": AGENT_STATE_ERROR
            }
    
    async def process_message_stream(
        self,
        conversation_id: str,
        user_message: str,
        content_type: str = "text",
        file_url: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        流式处理用户消息
        
        Args:
            conversation_id: 对话ID
            user_message: 用户消息
            content_type: 内容类型
            file_url: 文件URL
            
        Yields:
            响应文本块
        """
        try:
            # 记录用户消息
            conversation_memory.add_message(conversation_id, "user", user_message)
            
            # 构建消息
            llm_messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]
            llm_messages.extend(
                conversation_memory.get_messages_for_llm(conversation_id, limit=20)
            )
            
            # 流式输出
            full_response = ""
            async for chunk in openai_service.stream_chat(messages=llm_messages):
                full_response += chunk
                yield chunk
            
            # 记录完整回复
            conversation_memory.add_message(conversation_id, "assistant", full_response)
            
        except Exception as e:
            logger.error(f"流式处理失败: {str(e)}", exc_info=True)
            yield f"\n\n[错误: {str(e)}]"
    
    async def _call_llm_with_tools(
        self, messages: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """调用 LLM 并传入可用工具"""
        logger.info(f"调用 LLM，传入 {len(self.tool_schemas)} 个工具: {[s['function']['name'] for s in self.tool_schemas]}")
        response = await openai_service.chat_completion(
            messages=messages,
            max_tokens=2000,
            tools=self.tool_schemas
        )
        tool_calls = response.get("tool_calls", [])
        if tool_calls:
            logger.info(f"LLM 返回了 {len(tool_calls)} 个工具调用: {[tc.function.name for tc in tool_calls]}")
        else:
            logger.info("LLM 未返回工具调用，直接回复文本")
        return response
    
    async def _execute_tool_calls(self, tool_calls: List[Any]) -> List[Dict[str, Any]]:
        """执行工具调用"""
        results = []
        
        for tool_call in tool_calls:
            tool_name = tool_call.function.name
            tool_args = json.loads(tool_call.function.arguments)
            
            logger.info(f"执行工具调用: {tool_name}({tool_args})")
            
            if tool_name in self.tools:
                try:
                    output = await self.tools[tool_name].execute(**tool_args)
                    results.append({
                        "tool_call_id": tool_call.id,
                        "tool_name": tool_name,
                        "output": output
                    })
                except Exception as e:
                    logger.error(f"工具执行失败: {tool_name}, error: {str(e)}")
                    results.append({
                        "tool_call_id": tool_call.id,
                        "tool_name": tool_name,
                        "output": {"error": str(e)}
                    })
            else:
                results.append({
                    "tool_call_id": tool_call.id,
                    "tool_name": tool_name,
                    "output": {"error": f"未知工具: {tool_name}"}
                })
        
        return results
    
    async def _handle_image_input(self, file_url: str, user_text: str) -> str:
        """处理图像输入"""
        try:
            question = user_text if user_text.strip() else "请描述这张图像"
            result = await self.tools["image_analyzer"].execute(
                image_url=file_url,
                question=question
            )
            if result.get("success"):
                return f"[用户上传了一张图像] 图像文件路径: {file_url}\n图像分析结果: {result['analysis']}"
            return f"[用户上传了一张图像，文件路径: {file_url}，但分析失败: {result.get('error')}]"
        except Exception as e:
            return f"[用户上传了一张图像，文件路径: {file_url}，处理失败: {str(e)}]"
    
    async def _handle_video_input(self, file_url: str, user_text: str) -> str:
        """处理视频输入"""
        try:
            question = user_text if user_text.strip() else "请描述这个视频的内容"
            result = await self.tools["video_analyzer"].execute(
                video_path=file_url,
                question=question
            )
            if result.get("success"):
                return f"[用户上传了一个视频] 视频分析结果: {result['analysis']}"
            return f"[用户上传了一个视频，但分析失败: {result.get('error')}]"
        except Exception as e:
            return f"[用户上传了一个视频，处理失败: {str(e)}]"

    async def _handle_audio_input(self, file_path: str) -> str:
        """处理音频输入"""
        try:
            logger.info(f"📂 读取音频文件：{file_path}")
            with open(file_path, "rb") as f:
                audio_data = f.read()
            logger.info(f" 音频文件大小：{len(audio_data)} bytes")
                
            logger.info(f"️ 调用 STT 服务...")
            text = await openai_service.audio_to_text(audio_data)
            logger.info(f"️ STT 转录结果：{text[:100] if text else 'None'}")
            return f"[语音消息转录] {text}"
        except Exception as e:
            logger.error(f"❌ 音频处理失败：{str(e)}", exc_info=True)
            return f"[语音消息处理失败：{str(e)}]"


# 全局 Agent 实例
agent = Agent()
