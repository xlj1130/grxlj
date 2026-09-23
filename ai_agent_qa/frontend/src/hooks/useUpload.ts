/**
 * 文件上传 Hook
 */
'use client';
import { useState, useCallback } from 'react';
import { UploadResponse } from '@/types';
import { apiService } from '@/services/api';

export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File): Promise<UploadResponse | null> => {
    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const result = await apiService.uploadFile(file);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      return result;
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || '上传失败';
      setError(msg);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const uploadImage = useCallback(async (file: File): Promise<UploadResponse | null> => {
    setIsUploading(true);
    setError(null);
    try {
      const result = await apiService.uploadImage(file);
      return result;
    } catch (err: any) {
      setError(err.message || '图像上传失败');
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const uploadAudio = useCallback(async (file: File): Promise<UploadResponse | null> => {
    setIsUploading(true);
    setError(null);
    try {
      const result = await apiService.uploadAudio(file);
      return result;
    } catch (err: any) {
      setError(err.message || '音频上传失败');
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  return {
    isUploading,
    uploadProgress,
    error,
    uploadFile,
    uploadImage,
    uploadAudio,
  };
}
