"""
数据库模型定义
定义用户、对话和消息的数据模型
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, LargeBinary, Boolean
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone
import uuid

Base = declarative_base()

def _utcnow():
    return datetime.now(timezone.utc)


def generate_uuid():
    """生成UUID"""
    return str(uuid.uuid4())


class User(Base):
    """用户模型"""
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)  # 可选的密码哈希
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    
    # 关系
    conversations = relationship("Conversation", back_populates="user")


class Conversation(Base):
    """对话模型"""
    __tablename__ = "conversations"
    
    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)  # 对话标题
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    
    # 关系
    user = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.timestamp")


class Message(Base):
    """消息模型"""
    __tablename__ = "messages"
    
    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)
    sender_type = Column(String, nullable=False)  # 'user' 或 'agent'
    content_type = Column(String, nullable=False)  # 'text', 'image', 'audio', 'video'
    content = Column(Text, nullable=True)  # 文本内容或文件路径
    file_path = Column(String, nullable=True)  # 文件实际存储路径
    file_url = Column(String, nullable=True)  # 文件访问URL
    timestamp = Column(DateTime, default=_utcnow)
    metadata_json = Column(Text, nullable=True)  # 额外元数据（JSON格式）
    
    # 关系
    conversation = relationship("Conversation", back_populates="messages")
