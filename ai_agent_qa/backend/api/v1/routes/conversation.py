"""
对话管理路由
提供对话的 CRUD 操作
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List
import logging

from ....db.database import get_db
from ....db.models import Conversation, Message
from ....db.schemas import (
    ConversationCreate, ConversationUpdate, ConversationResponse,
    MessageResponse
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    user_id: str = "default_user",
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """获取对话列表"""
    try:
        query = (
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(desc(Conversation.updated_at))
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        conversations = result.scalars().all()
        
        return [
            ConversationResponse(
                id=conv.id,
                user_id=conv.user_id,
                title=conv.title,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                messages=[]
            )
            for conv in conversations
        ]
    except Exception as e:
        logger.error(f"获取对话列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取单个对话详情（含消息列表）"""
    try:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise HTTPException(status_code=404, detail="对话不存在")
        
        # 获取消息
        msg_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.timestamp)
        )
        messages = msg_result.scalars().all()
        
        return ConversationResponse(
            id=conversation.id,
            user_id=conversation.user_id,
            title=conversation.title,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            messages=[
                MessageResponse(
                    id=msg.id,
                    conversation_id=msg.conversation_id,
                    sender_type=msg.sender_type,
                    content_type=msg.content_type,
                    content=msg.content,
                    file_path=msg.file_path,
                    file_url=msg.file_url,
                    timestamp=msg.timestamp
                )
                for msg in messages
            ]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取对话详情失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db)
):
    """创建新对话"""
    try:
        import uuid
        conversation = Conversation(
            id=str(uuid.uuid4()),
            user_id=data.user_id,
            title=data.title
        )
        db.add(conversation)
        await db.flush()
        await db.refresh(conversation)
        
        return ConversationResponse(
            id=conversation.id,
            user_id=conversation.user_id,
            title=conversation.title,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            messages=[]
        )
    except Exception as e:
        logger.error(f"创建对话失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    data: ConversationUpdate,
    db: AsyncSession = Depends(get_db)
):
    """更新对话标题"""
    try:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise HTTPException(status_code=404, detail="对话不存在")
        
        if data.title is not None:
            conversation.title = data.title
        
        await db.flush()
        await db.refresh(conversation)
        
        return ConversationResponse(
            id=conversation.id,
            user_id=conversation.user_id,
            title=conversation.title,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            messages=[]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新对话失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db)
):
    """删除对话及其所有消息"""
    try:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise HTTPException(status_code=404, detail="对话不存在")
        
        # 删除所有消息
        msg_result = await db.execute(
            select(Message).where(Message.conversation_id == conversation_id)
        )
        for msg in msg_result.scalars().all():
            await db.delete(msg)
        
        await db.delete(conversation)
        await db.flush()
        
        return {"message": "对话已删除", "conversation_id": conversation_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除对话失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
