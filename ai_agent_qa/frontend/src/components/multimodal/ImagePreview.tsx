'use client';
import { useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  onClose?: () => void;
}

export function ImagePreview({ src, alt = '图像预览', onClose }: ImagePreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      {/* 缩略图 */}
      <div className="relative group">
        <img
          src={src}
          alt={alt}
          className="max-w-full rounded-lg cursor-pointer max-h-48 object-contain"
          onClick={() => setIsFullscreen(true)}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <ZoomIn className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* 全屏预览 */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
