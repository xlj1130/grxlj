"""
Agent 记忆模块
负责管理对话上下文和长期记忆
"""
from typing import List, Dict, Any, Optional
from collections import deque
import logging

logger = logging.getLogger(__name__)


class ConversationMemory:
    """对话记忆管理器 - 维护单个对话的上下文"""
    
    def __init__(self, max_messages: int = 50):
        """
        初始化对话记忆
        
        Args:
            max_messages: 最大保留消息数
        """
        self.max_messages = max_messages
        self._messages: Dict[str, deque] = {}  # conversation_id -> messages
    
    def add_message(self, conversation_id: str, role: str, content: str, 
                    metadata: Optional[Dict[str, Any]] = None):
        """
        添加一条消息到记忆
        
        Args:
            conversation_id: 对话ID
            role: 角色 (user/assistant/system)
            content: 消息内容
            metadata: 额外元数据
        """
        if conversation_id not in self._messages:
            self._messages[conversation_id] = deque(maxlen=self.max_messages)
        
        message = {"role": role, "content": content}
        if metadata:
            message["metadata"] = metadata
        
        self._messages[conversation_id].append(message)
        logger.debug(f"记忆已添加: conv={conversation_id}, role={role}")
    
    def get_messages(self, conversation_id: str, 
                     limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        获取对话历史消息
        
        Args:
            conversation_id: 对话ID
            limit: 返回消息数量限制
            
        Returns:
            消息列表
        """
        if conversation_id not in self._messages:
            return []
        
        messages = list(self._messages[conversation_id])
        if limit:
            messages = messages[-limit:]
        
        return messages
    
    def get_messages_for_llm(self, conversation_id: str,
                              limit: Optional[int] = None) -> List[Dict[str, str]]:
        """
        获取适用于 LLM API 的消息格式
        
        Args:
            conversation_id: 对话ID
            limit: 消息数量限制
            
        Returns:
            格式化的消息列表
        """
        messages = self.get_messages(conversation_id, limit)
        return [{"role": m["role"], "content": m["content"]} for m in messages]
    
    def clear(self, conversation_id: str):
        """清空指定对话的记忆"""
        if conversation_id in self._messages:
            del self._messages[conversation_id]
            logger.info(f"记忆已清空: conv={conversation_id}")
    
    def get_summary(self, conversation_id: str) -> Dict[str, Any]:
        """获取对话记忆摘要"""
        messages = self.get_messages(conversation_id)
        return {
            "conversation_id": conversation_id,
            "total_messages": len(messages),
            "user_messages": sum(1 for m in messages if m["role"] == "user"),
            "assistant_messages": sum(1 for m in messages if m["role"] == "assistant"),
        }


class LongTermMemory:
    """长期记忆管理器 - 跨对话的知识存储"""
    
    def __init__(self):
        """初始化长期记忆"""
        self._store: Dict[str, List[Dict[str, Any]]] = {}  # user_id -> memories
    
    def store(self, user_id: str, key: str, value: Any, 
              category: str = "general"):
        """
        存储长期记忆
        
        Args:
            user_id: 用户ID
            key: 记忆键
            value: 记忆值
            category: 记忆分类
        """
        if user_id not in self._store:
            self._store[user_id] = []
        
        self._store[user_id].append({
            "key": key,
            "value": value,
            "category": category
        })
        logger.info(f"长期记忆已存储: user={user_id}, key={key}")
    
    def recall(self, user_id: str, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        召回长期记忆
        
        Args:
            user_id: 用户ID
            category: 按分类过滤
            
        Returns:
            记忆列表
        """
        if user_id not in self._store:
            return []
        
        memories = self._store[user_id]
        if category:
            memories = [m for m in memories if m.get("category") == category]
        
        return memories
    
    def clear(self, user_id: str):
        """清空用户的长期记忆"""
        if user_id in self._store:
            del self._store[user_id]


# 全局实例
conversation_memory = ConversationMemory()
long_term_memory = LongTermMemory()
