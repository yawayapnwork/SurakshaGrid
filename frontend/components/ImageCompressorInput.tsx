'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Camera, Trash2, UploadCloud } from 'lucide-react';
import { compressImage } from '@/utils/imageCompression';

interface ImageCompressorInputProps {
  onImageCompressed: (blob: Blob | null) => void;
}

export const ImageCompressorInput: React.FC<ImageCompressorInputProps> = ({ onImageCompressed }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalSizeKb, setOriginalSizeKb] = useState<number | null>(null);
  const [compressedSizeKb, setCompressedSizeKb] = useState<number | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setOriginalSizeKb(Math.round(file.size / 1024));
    setIsCompressing(true);

    try {
      // 1. Generate preview URL
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      // 2. Compress image using Canvas
      const compressedBlob = await compressImage(file, 1024, 1024, 0.85);
      setCompressedSizeKb(Math.round(compressedBlob.size / 1024));

      // Pass compressed Blob back to parent form
      onImageCompressed(compressedBlob);
    } catch (err) {
      console.error('Image compression failed:', err);
      // Fallback to original file if compression fails
      onImageCompressed(file);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleRemoveImage = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setOriginalSizeKb(null);
    setCompressedSizeKb(null);
    onImageCompressed(null);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
        <Camera className="w-4 h-4 text-slate-400" /> Photo Evidence (Standing Water / Flood)
      </label>

      {previewUrl ? (
        <div className="relative bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-4">
          <Image
            src={previewUrl}
            alt="Flood evidence preview"
            width={80}
            height={80}
            unoptimized
            className="w-20 h-20 object-cover rounded-lg border border-slate-200"
          />
          <div className="flex-1 space-y-1">
            <span className="text-xs font-semibold text-slate-900 block">Photo Attached</span>
            {isCompressing ? (
              <span className="text-[11px] text-slate-500 block">Compressing photo on client...</span>
            ) : (
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <div>Original: {originalSizeKb} KB</div>
                <div className="text-emerald-600 font-medium">
                  Compressed: {compressedSizeKb} KB ({Math.round((1 - (compressedSizeKb || 0) / (originalSizeKb || 1)) * 100)}% smaller)
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleRemoveImage}
            className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl cursor-pointer bg-slate-50/60 hover:bg-slate-50 transition-all text-slate-500 hover:text-slate-700">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <UploadCloud className="w-6 h-6 text-slate-400 mb-1" />
            <p className="text-xs font-semibold">Tap to snap or upload flood photo</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Auto-compressed client-side for fast emergency transmission
            </p>
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
};
