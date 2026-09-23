'use client';
import { useState, useCallback } from 'react';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { useUpload } from '@/hooks/useUpload';

interface FileUploadProps {
  onUploadComplete: (fileUrl: string, contentType: string) => void;
  accept?: string;
  children?: React.ReactNode;
}

export function FileUpload({ onUploadComplete, accept, children }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const { uploadFile, isUploading, uploadProgress, error } = useUpload();

  const handleFile = useCallback(async (file: File) => {
    const result = await uploadFile(file);
    if (result) {
      onUploadComplete(result.file_url, result.content_type);
    }
  }, [uploadFile, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  return (
    <div>
      {/* 拖拽区域 */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          dragActive
            ? 'border-primary-400 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          if (accept) input.accept = accept;
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) handleFile(file);
          };
          input.click();
        }}
      >
        {children || (
          <div className="text-gray-400">
            <Upload className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">拖拽文件到此处，或点击选择文件</p>
          </div>
        )}
      </div>

      {/* 上传进度 */}
      {isUploading && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary-500 h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{uploadProgress}%</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-2 flex items-center gap-1 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
}
