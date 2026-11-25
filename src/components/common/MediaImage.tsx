import React from 'react';
import { ImageOff } from 'lucide-react';
import { useResolvedMedia, type MediaVariant } from '../../services/mediaStore';
import type { PhotoCrop } from '../../types/family';
import { getCropImageStyle } from '../../utils/collage';

interface MediaImageProps {
  mediaId: string;
  variant?: MediaVariant;
  alt: string;
  crop?: PhotoCrop;
  className?: string;
  style?: React.CSSProperties;
}

export const MediaImage: React.FC<MediaImageProps> = ({
  mediaId,
  variant = 'thumb',
  alt,
  crop,
  className = 'w-full h-full object-cover',
  style,
}) => {
  const { url, loading } = useResolvedMedia(mediaId, variant);

  if (loading) {
    return (
      <div
        className="w-full h-full bg-stone-200/80 dark:bg-stone-800/80 animate-pulse"
        aria-hidden="true"
      />
    );
  }

  if (!url) {
    return (
      <div className="w-full h-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400">
        <ImageOff className="w-6 h-6" />
      </div>
    );
  }

  const mergedStyle: React.CSSProperties | undefined = crop
    ? { ...getCropImageStyle(crop), ...style }
    : style;

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      draggable={false}
      style={mergedStyle}
      className={className}
    />
  );
};
