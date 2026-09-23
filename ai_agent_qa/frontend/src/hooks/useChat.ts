/**
 * 聊天 Hook
 * 管理聊天状态和消息收发逻辑
 */
'use client';
import { useState, useCallback, useRef } from 'react';
import { Message, ChatResponse, AgentState, Conversation } from '@/types';
import { apiService } from '@/services/api';

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** 发送文本消息 */
  const sendMessage = useCallback(async (text: string, fileUrl?: string, contentType: 'text' | 'image' | 'audio' = 'text') => {
    if (!text.trim() && !fileUrl) return;
    setError(null);

    // 添加用户消息到列表
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: currentConversationId || '',
      sender_type: 'user',
      content_type: contentType,
      content: text,
      file_url: fileUrl,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setAgentState({ status: 'thinking' });

    try {
      const response = await apiService.sendMessage({
        conversation_id: currentConversationId || undefined,
        message: text,
        content_type: contentType,
        file_url: fileUrl,
      });

      // 更新对话 ID
      if (!currentConversationId) {
        setCurrentConversationId(response.conversation_id);
      }

      // 添加 Agent 回复
      const agentMessage: Message = {
        id: response.message_id,
        conversation_id: response.conversation_id,
        sender_type: 'agent',
        content_type: response.content_type,
        content: response.response,
        timestamp: response.timestamp,
        metadata: response.metadata,
      };
      setMessages((prev) => [...prev, agentMessage]);
      setAgentState({ status: 'idle' });
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message || '发送失败';
      setError(errorMsg);
      setAgentState({ status: 'error', message: errorMsg });
    } finally {
      setIsLoading(false);
    }
  }, [currentConversationId]);

  /** 流式发送消息 */
  const sendMessageStream = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setError(null);

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: currentConversationId || '',
      sender_type: 'user',
      content_type: 'text',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setAgentState({ status: 'streaming' });

    // 创建占位的 Agent 消息
    const agentMsgId = `stream-${Date.now()}`;
    const agentMessage: Message = {
      id: agentMsgId,
      conversation_id: currentConversationId || '',
      sender_type: 'agent',
      content_type: 'text',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, agentMessage]);

    let accumulated = '';
    await apiService.sendMessageStream(
      {
        conversation_id: currentConversationId || undefined,
        message: text,
        content_type: 'text',
      },
      (chunk) => {
        accumulated += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentMsgId ? { ...m, content: accumulated } : m
          )
        );
      },
      () => {
        setIsLoading(false);
        setAgentState({ status: 'idle' });
      },
      (errMsg) => {
        setError(errMsg);
        setIsLoading(false);
        setAgentState({ status: 'error', message: errMsg });
      }
    );
  }, [currentConversationId]);

  /** 加载对话列表 */
  const loadConversations = useCallback(async () => {
    try {
      const convs = await apiService.getConversations();
      setConversations(convs);
    } catch (err: any) {
      console.error('加载对话列表失败:', err);
    }
  }, []);

  /** 切换到指定对话 */
  const switchConversation = useCallback(async (conversationId: string) => {
    try {
      const conv = await apiService.getConversation(conversationId);
      setCurrentConversationId(conv.id);
      setMessages(conv.messages);
    } catch (err: any) {
      setError('加载对话失败');
    }
  }, []);

  /** 新建对话 */
  const newConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
    setError(null);
    setAgentState({ status: 'idle' });
  }, []);

  /** 删除对话 */
  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      await apiService.deleteConversation(conversationId);
      if (currentConversationId === conversationId) {
        newConversation();
      }
      await loadConversations();
    } catch (err: any) {
      setError('删除对话失败');
    }
  }, [currentConversationId, newConversation, loadConversations]);

  return {
    messages,
    conversations,
    currentConversationId,
    isLoading,
    agentState,
    error,
    sendMessage,
    sendMessageStream,
    loadConversations,
    switchConversation,
    newConversation,
    deleteConversation,
  };
}
