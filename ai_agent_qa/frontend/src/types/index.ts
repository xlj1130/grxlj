/**
 * 前端类型定义
 */

// 消息内容类型
export type ContentType = 'text' | 'image' | 'audio' | 'video';

// 发送者类型
export type SenderType = 'user' | 'agent';

// 消息接口
export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  content_type: ContentType;
  content: string | null;
  file_path?: string | null;
  file_url?: string | null;
  timestamp: string;
  metadata?: Record<string, any>;
}

// 对话接口
export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  messages: Message[];
}

// 聊天请求
export interface ChatRequest {
  conversation_id?: string;
  message: string;
  content_type: ContentType;
  file_url?: string;
  file_path?: string;
  metadata?: Record<string, any>;
}

// 聊天响应
export interface ChatResponse {
  conversation_id: string;
  message_id: string;
  response: string;
  content_type: ContentType;
  timestamp: string;
  metadata?: Record<string, any>;
}

// 上传响应
export interface UploadResponse {
  file_path: string;
  file_url: string;
  file_size: number;
  content_type: string;
}

// Agent 状态
export interface AgentState {
  status: 'idle' | 'thinking' | 'tool_call' | 'streaming' | 'error';
  message?: string;
}

// 聊天 UI 状态
export interface ChatUIState {
  messages: Message[];
  currentConversationId: string | null;
  isLoading: boolean;
  agentState: AgentState;
  error: string | null;
}
