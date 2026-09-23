'use client';
import { Message } from '@/types';
import { Bot, User } from 'lucide-react';
import clsx from 'clsx';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender_type === 'user';

  return (
    <div className={clsx('flex gap-3 message-bubble', isUser ? 'justify-end' : 'justify-start')}>
      {/* Agent 头像 */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-primary-600" />
        </div>
      )}

      {/* 消息气泡 */}
      <div
        className={clsx(
          'max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm',
          isUser
            ? 'bg-primary-500 text-white rounded-br-md'
            : 'bg-white text-gray-800 border border-gray-100 rounded-bl-md'
        )}
      >
        {/* 文件预览 */}
        {message.file_url && message.content_type === 'image' && (
          <div className="mb-2">
            <img
              src={message.file_url}
              alt="上传的图像"
              className="max-w-full rounded-lg max-h-64 object-contain"
            />
          </div>
        )}

        {message.file_url && message.content_type === 'video' && (
          <div className="mb-2">
            <video
              controls
              src={message.file_url}
              className="max-w-full rounded-lg max-h-64"
            />
          </div>
        )}

        {message.file_url && message.content_type === 'audio' && (
          <div className="mb-2">
            <audio controls src={message.file_url} className="max-w-full" />
          </div>
        )}

        {/* AI 语音回复（TTS 生成的音频） */}
        {message.metadata?.audio_url && !isUser && (
          <div className="mb-2">
            <p className="text-xs text-gray-500 mb-1.5">🔊 语音回复：</p>
            <audio controls src={message.metadata.audio_url} className="max-w-full" />
          </div>
        )}

        {/* AI 生成的图片 */}
        {message.metadata?.generated_image_urls && message.metadata.generated_image_urls.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-gray-500 mb-1.5"> AI 生成的图片：</p>
            <div className="grid gap-2" style={{ gridTemplateColumns: message.metadata.generated_image_urls.length > 1 ? 'repeat(2, 1fr)' : '1fr' }}>
              {message.metadata.generated_image_urls.map((url: string, idx: number) => (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt={`AI生成的图片 ${idx + 1}`}
                    className="max-w-full rounded-lg max-h-80 object-contain border border-gray-200 hover:border-primary-400 transition-colors cursor-pointer"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 文本内容 */}
        {message.content && (
          isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="text-sm markdown-content">
              {message.content}
            </div>
          )
        )}

        {/* 时间戳 */}
        <div
          className={clsx(
            'text-xs mt-1',
            isUser ? 'text-primary-200' : 'text-gray-400'
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      {/* 用户头像 */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-gray-600" />
        </div>
      )}
    </div>
  );
}
