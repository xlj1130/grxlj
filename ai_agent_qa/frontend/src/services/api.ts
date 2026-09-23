/**
 * API 服务层
 * 封装与后端的 HTTP 通信
 */
import axios, { AxiosInstance } from 'axios';
import {
  ChatRequest,
  ChatResponse,
  Conversation,
  UploadResponse,
  Message,
} from '@/types';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/v1',
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // ========== 聊天 ==========

  /** 发送消息 */
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const { data } = await this.client.post<ChatResponse>('/chat', request);
    return data;
  }

  /** 流式发送消息 */
  async sendMessageStream(
    request: ChatRequest,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (error: string) => void
  ): Promise<void> {
    try {
      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const content = line.slice(6);
            if (content === '[DONE]') {
              onDone();
              return;
            }
            onChunk(content);
          }
        }
      }
      onDone();
    } catch (error: any) {
      onError(error.message || '流式请求失败');
    }
  }

  // ========== 对话管理 ==========

  /** 获取对话列表 */
  async getConversations(userId: string = 'default_user'): Promise<Conversation[]> {
    const { data } = await this.client.get<Conversation[]>('/conversations', {
      params: { user_id: userId },
    });
    return data;
  }

  /** 获取对话详情 */
  async getConversation(conversationId: string): Promise<Conversation> {
    const { data } = await this.client.get<Conversation>(
      `/conversations/${conversationId}`
    );
    return data;
  }

  /** 创建对话 */
  async createConversation(userId: string, title?: string): Promise<Conversation> {
    const { data } = await this.client.post<Conversation>('/conversations', {
      user_id: userId,
      title,
    });
    return data;
  }

  /** 删除对话 */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.client.delete(`/conversations/${conversationId}`);
  }

  // ========== 文件上传 ==========

  /** 上传文件 */
  async uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await this.client.post<UploadResponse>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  /** 上传图像 */
  async uploadImage(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await this.client.post<UploadResponse>('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  /** 上传音频 */
  async uploadAudio(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await this.client.post<UploadResponse>('/upload/audio', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }
}

// 导出单例
export const apiService = new ApiService();
