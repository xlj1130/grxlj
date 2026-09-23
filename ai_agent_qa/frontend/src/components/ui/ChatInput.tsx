'use client';
import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Image, Mic, Paperclip, X } from 'lucide-react';
import { useUpload } from '@/hooks/useUpload';
import { AudioRecorder } from '@/components/multimodal/AudioRecorder';

interface ChatInputProps {
  onSend: (text: string, fileUrl?: string, contentType?: 'text' | 'image' | 'audio') => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ url: string; type: 'video' | 'image' | 'audio' } | null>(null);
  const [isRecordingMode, setIsRecordingMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploadImage, uploadAudio, isUploading } = useUpload();

  const handleSend = () => {
    if ((!text.trim() && !attachedFile) || disabled || isUploading) return;

    const contentType = attachedFile?.type || 'text';
    onSend(text, attachedFile?.url, contentType);
    setText('');
    setAttachedFile(null);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'audio' | 'file') => {
    const file = e.target.files?.[0];
    if (!file) return;

    let result;
    // 根据文件类型选择上传方法
    const isVideo = file.type.startsWith('video/');
    if (isVideo) {
      // 视频文件使用通用上传接口
      result = await uploadFile(file);
    } else if (type === 'image') {
      result = await uploadImage(file);
    } else if (type === 'audio') {
      result = await uploadAudio(file);
    } else {
      result = await uploadFile(file);
    }

    if (result) {
      // 根据 content_type 确定类型
      const contentType = result.content_type.startsWith('video/') ? 'video' :
                          result.content_type.startsWith('image/') ? 'image' : 
                          result.content_type.startsWith('audio/') ? 'audio' : 'text';
      setAttachedFile({ url: result.file_url, type: contentType as 'video' | 'image' | 'audio' });
    }

    // 重置 input
    e.target.value = '';
  };

  // 录音完成回调：上传录音文件并发送
  const handleRecordingComplete = async (file: File) => {
    setIsRecordingMode(false);
    const result = await uploadAudio(file);
    if (result) {
      onSend('', result.file_url, 'audio');
    }
  };

  // 切换录音模式
  const toggleRecordingMode = () => {
    if (disabled || isUploading) return;
    setIsRecordingMode(!isRecordingMode);
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0">
      {/* 附件预览 */}
      {attachedFile && (
        <div className="mb-2 flex items-center gap-2 bg-gray-50 rounded-lg p-2 w-fit">
          {attachedFile.type === 'video' ? (
            <div className="w-12 h-12 bg-blue-100 rounded flex items-center justify-center text-xs text-blue-600">
              Video
            </div>
          ) : attachedFile.type === 'image' ? (
            <img src={attachedFile.url} alt="预览" className="w-12 h-12 object-cover rounded" />
          ) : (
            <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">
              Audio
            </div>
          )}
          <span className="text-sm text-gray-600 truncate max-w-48">{attachedFile.url}</span>
          <button onClick={() => setAttachedFile(null)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 录音模式 */}
      {isRecordingMode ? (
        <div className="flex items-center justify-between">
          <AudioRecorder onRecordingComplete={handleRecordingComplete} disabled={disabled} />
          <button
            onClick={() => setIsRecordingMode(false)}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消录音
          </button>
        </div>
      ) : (
        /* 正常输入模式 */
        <div className="flex items-end gap-2">
          {/* 工具按钮 */}
          <div className="flex gap-1">
            <button
              onClick={() => imageInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-primary-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="发送图像"
              disabled={disabled}
            >
              <Image className="w-5 h-5" />
            </button>
            <button
              onClick={toggleRecordingMode}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="语音输入"
              disabled={disabled}
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-primary-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="发送文件"
              disabled={disabled}
            >
              <Paperclip className="w-5 h-5" />
            </button>
          </div>

          {/* 文本输入 */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Agent 正在思考...' : '输入消息... (Enter 发送)'}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:bg-gray-50 disabled:text-gray-400"
          />

          {/* 发送按钮 */}
          <button
            onClick={handleSend}
            disabled={disabled || isUploading || (!text.trim() && !attachedFile)}
            className="p-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* 隐藏的文件选择器 */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'image')}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'audio')}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'file')}
      />
    </div>
  );
}
