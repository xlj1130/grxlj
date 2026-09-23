"""
数据库Schema定义
定义Pydantic模型用于API请求和响应验证
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class SenderType(str, Enum):
    """发送者类型枚举"""
    user = "user"
    agent = "agent"


class ContentType(str, Enum):
    """内容类型枚举"""
    text = "text"
    image = "image"
    audio = "audio"
    video = "video"


class UserBase(BaseModel):
    """用户基础模型"""
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., pattern=r'^[\w\.-]+@[\w\.-]+\.\w+$')


class UserCreate(UserBase):
    """用户创建模型"""
    password: str = Field(..., min_length=6)


class UserUpdate(BaseModel):
    """用户更新模型"""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[str] = Field(None, pattern=r'^[\w\.-]+@[\w\.-]+\.\w+$')
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    """用户响应模型"""
    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MessageBase(BaseModel):
    """消息基础模型"""
    conversation_id: str
    sender_type: SenderType
    content_type: ContentType
    content: Optional[str] = None
    file_path: Optional[str] = None
    file_url: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None


class MessageCreate(MessageBase):
    """消息创建模型"""
    pass


class MessageUpdate(BaseModel):
    """消息更新模型"""
    content: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None


class MessageResponse(MessageBase):
    """消息响应模型"""
    id: str
    timestamp: datetime

    class Config:
        from_attributes = True


class ConversationBase(BaseModel):
    """对话基础模型"""
    user_id: str
    title: Optional[str] = None


class ConversationCreate(ConversationBase):
    """对话创建模型"""
    pass


class ConversationUpdate(BaseModel):
    """对话更新模型"""
    title: Optional[str] = None


class ConversationResponse(ConversationBase):
    """对话响应模型"""
    id: str
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    """聊天请求模型"""
    conversation_id: Optional[str] = None
    message: str
    content_type: ContentType = ContentType.text
    file_url: Optional[str] = None
    file_path: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    """聊天响应模型"""
    conversation_id: str
    message_id: str
    response: str
    content_type: ContentType = ContentType.text
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None


class UploadResponse(BaseModel):
    """上传响应模型"""
    file_path: str
    file_url: str
    file_size: int
    content_type: str


class ToolCall(BaseModel):
    """工具调用模型"""
    name: str
    arguments: Dict[str, Any]


class AgentState(BaseModel):
    """Agent状态模型"""
    conversation_id: str
    input_message: str
    content_type: ContentType
    file_path: Optional[str] = None
    tool_calls: List[ToolCall] = []
    tool_results: List[Dict[str, Any]] = []
    output_message: str
    status: str
    metadata: Optional[Dict[str, Any]] = None
