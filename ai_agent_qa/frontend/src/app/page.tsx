'use client';
import { useEffect } from 'react';
import { ChatWindow } from '@/components/layout/ChatWindow';
import { Sidebar } from '@/components/layout/Sidebar';
import { useChat } from '@/hooks/useChat';

export default function Home() {
  const chat = useChat();

  useEffect(() => {
    chat.loadConversations();
  }, []);

  return (
    <main className="flex h-screen overflow-hidden">
      {/* 侧边栏 - 对话列表 */}
      <Sidebar
        conversations={chat.conversations}
        currentConversationId={chat.currentConversationId}
        onSelectConversation={chat.switchConversation}
        onNewConversation={chat.newConversation}
        onDeleteConversation={chat.deleteConversation}
      />

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col">
        <ChatWindow
          messages={chat.messages}
          isLoading={chat.isLoading}
          agentState={chat.agentState}
          error={chat.error}
          onSendMessage={chat.sendMessage}
        />
      </div>
    </main>
  );
}
