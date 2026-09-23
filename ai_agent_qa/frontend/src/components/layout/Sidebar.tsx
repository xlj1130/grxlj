'use client';
import { Conversation } from '@/types';
import { MessageSquarePlus, MessageCircle, Trash2, X } from 'lucide-react';
import clsx from 'clsx';

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
}

export function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-full shrink-0">
      {/* 新建对话按钮 */}
      <div className="p-3 border-b border-gray-700">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-600 hover:bg-gray-800 transition-colors text-sm"
        >
          <MessageSquarePlus className="w-4 h-4" />
          新建对话
        </button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 ? (
          <div className="text-center text-gray-500 text-sm mt-8">
            暂无对话记录
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={clsx(
                'group flex items-center gap-2 mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm',
                currentConversationId === conv.id
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              )}
              onClick={() => onSelectConversation(conv.id)}
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1">
                {conv.title || '未命名对话'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation(conv.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 底部信息 */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-500 text-center">
        Multimodal Agent QA v1.0
      </div>
    </aside>
  );
}
