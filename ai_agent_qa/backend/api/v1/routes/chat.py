"""
聊天路由
处理聊天消息的发送和接收
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import logging
import uuid
import os
import aiofiles

from ....db.database import get_db
from ....db.models import Conversation, Message
from ....db.schemas import ChatRequest, ChatResponse, ContentType
from ....agents.agent import agent
from ....services.openai_service import openai_service
from ....config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/chat")
async def send_message(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    发送聊天消息
    
    接收用户消息，通过 Agent 处理后返回回复
    """
    try:
        # 获取或创建对话
        conversation_id = request.conversation_id
        if not conversation_id:
            conversation_id = str(uuid.uuid4())
            conversation = Conversation(
                id=conversation_id,
                user_id="default_user",  # TODO: 从认证中获取
                title=request.message[:50] if request.message else "新对话"
            )
            db.add(conversation)
            await db.flush()
        
        # 保存用户消息到数据库
        user_msg = Message(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            sender_type="user",
            content_type=request.content_type.value,
            content=request.message,
            file_path=request.file_path,
            file_url=request.file_url
        )
        db.add(user_msg)
        
        # 调用 Agent 处理
        result = await agent.process_message(
            conversation_id=conversation_id,
            user_message=request.message,
            content_type=request.content_type.value,
            file_path=request.file_path,
            file_url=request.file_url,
            metadata=request.metadata
        )
        
        logger.info(f"Agent 返回结果: message_id={result.get('message_id')}, response长度={len(result.get('response', ''))}, metadata_keys={list(result.get('metadata', {}).keys())}")
        
        # 安全获取 metadata（防止 None 值）
        result_metadata = result.get("metadata") or {}
        
        # 确定响应内容类型（如果有生成的图片，则为 image）
        response_content_type = "image" if result_metadata.get("generated_image_urls") else "text"
        
        # 语音消息：将文本回复转为语音（TTS）
        if request.content_type == ContentType.audio:
            try:
                response_text = result["response"]
                logger.info(f"语音模式：开始 TTS 转换，文本长度={len(response_text)}")
                
                audio_bytes = await openai_service.text_to_speech(response_text)
                
                # 保存音频文件
                audio_dir = os.path.join(settings.UPLOAD_DIR, "audio")
                os.makedirs(audio_dir, exist_ok=True)
                audio_filename = f"{uuid.uuid4()}.mp3"
                audio_file_path = os.path.join(audio_dir, audio_filename)
                
                async with aiofiles.open(audio_file_path, "wb") as f:
                    await f.write(audio_bytes)
                
                audio_url = f"/uploads/audio/{audio_filename}"
                response_content_type = "audio"
                result_metadata["audio_url"] = audio_url
                logger.info(f"TTS 成功：音频已保存 {audio_url}，大小={len(audio_bytes)} bytes")
            except Exception as e:
                logger.error(f"TTS 转换失败: {str(e)}", exc_info=True)
                # TTS 失败不影响文本回复，降级为文本返回
                result_metadata["tts_error"] = str(e)
        
        # 保存 Agent 回复到数据库
        agent_msg = Message(
            id=result["message_id"],
            conversation_id=conversation_id,
            sender_type="agent",
            content_type=response_content_type,
            content=result["response"]
        )
        db.add(agent_msg)
        await db.flush()
        
        # 直接返回 dict，绕过 Pydantic response_model 验证
        response_data = {
            "conversation_id": conversation_id,
            "message_id": result["message_id"],
            "response": result["response"],
            "content_type": response_content_type,
            "timestamp": result["timestamp"].isoformat(),
            "metadata": result_metadata
        }
        
        # 验证 response 可序列化
        import json
        try:
            json.dumps(response_data, ensure_ascii=False)
            logger.info("response 序列化验证通过")
        except (TypeError, ValueError) as e:
            logger.error(f"response 不可序列化: {e}")
            # 移除 metadata 重试
            response_data["metadata"] = None
            logger.info("已移除 metadata，重试序列化")
            json.dumps(response_data, ensure_ascii=False)
        
        logger.info(f"即将返回响应: {response_data['message_id']}")
        return response_data
        
    except Exception as e:
        logger.error(f"发送消息失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理消息失败: {str(e)}")


@router.post("/chat/stream")
async def stream_message(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    流式发送聊天消息
    
    使用 Server-Sent Events 流式返回 Agent 回复
    """
    from fastapi.responses import StreamingResponse
    
    conversation_id = request.conversation_id or str(uuid.uuid4())
    
    async def generate():
        async for chunk in agent.process_message_stream(
            conversation_id=conversation_id,
            user_message=request.message,
            content_type=request.content_type.value,
            file_url=request.file_url
        ):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Conversation-Id": conversation_id
        }
    )
