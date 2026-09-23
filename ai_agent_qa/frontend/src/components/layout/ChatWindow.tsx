'use client';
import { Message, AgentState } from '@/types';
import { ChatInput } from '@/components/ui/ChatInput';
import { MessageBubble } from '@/components/ui/MessageBubble';
import { useRef, useEffect } from 'react';
import { Bot } from 'lucide-react';

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
  agentState: AgentState;
  error: string | null;
  onSendMessage: (text: string, fileUrl?: string, contentType?: 'text' | 'image' | 'audio') => void;
}

export function ChatWindow({ messages, isLoading, agentState, error, onSendMessage }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
        <Bot className="w-6 h-6 text-primary-500 mr-2" />
        <h1 className="text-lg font-semibold text-gray-800">Multimodal Agent QA</h1>
        {agentState.status !== 'idle' && (
          <span className="ml-3 text-sm text-gray-500">
            {agentState.status === 'thinking' && '思考中...'}
            {agentState.status === 'tool_call' && '调用工具...'}
            {agentState.status === 'streaming' && '回复中...'}
            {agentState.status === 'error' && '出错'}
          </span>
        )}
      </header>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Bot className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">开始与 AI Agent 对话</p>
            <p className="text-sm mt-1">支持文本、图像、音频多模态交互</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* 加载指示器 */}
        {isLoading && (
          <div className="flex justify-start message-bubble">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot" />
                <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot" />
                <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot" />
              </div>
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg border border-red-200">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 输入区域 */}
      <ChatInput onSend={onSendMessage} disabled={isLoading} />
    </div>
  );
}
