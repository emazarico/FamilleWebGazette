import React from 'react';
import type { MediaVariant } from '../../services/mediaStore';
import type { CollageLayout, PhotoCrop } from '../../types/family';
import { normalizeCollageLayout } from '../../utils/feed';
import { MediaImage } from './MediaImage';

interface CollageGridProps {
  mediaIds: string[];
  layout: CollageLayout;
  crops?: Record<string, PhotoCrop>;
  altPrefix?: string;
  variant?: MediaVariant;
  onPhotoClick?: (index: number) => void;
}

export const CollageGrid: React.FC<CollageGridProps> = ({
  mediaIds,
  layout,
  crops,
  altPrefix = 'Family photo',
  variant = 'full',
  onPhotoClick,
}) => {
  if (mediaIds.length === 0) return null;

  const effective = normalizeCollageLayout(mediaIds.length, layout);

  const renderTile = (mediaId: string, idx: number, extraClass = '') => {
    const content = (
      <MediaImage
        mediaId={mediaId}
        variant={variant}
        crop={crops?.[mediaId]}
        alt={`${altPrefix} ${idx + 1}`}
        className="w-full h-full object-cover transition-[filter] duration-300 group-hover/tile:brightness-[1.03]"
      />
    );

    if (onPhotoClick) {
      return (
        <button
          key={`${mediaId}-${idx}`}
          type="button"
          onClick={() => onPhotoClick(idx)}
          className={`group/tile relative overflow-hidden bg-stone-100 dark:bg-stone-800 block w-full h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B5E7C] ${extraClass}`}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        key={`${mediaId}-${idx}`}
        className={`group/tile relative overflow-hidden bg-stone-100 dark:bg-stone-800 ${extraClass}`}
      >
        {content}
      </div>
    );
  };

  if (effective === 'single') {
    return (
      <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-stone-100 dark:bg-stone-800">
        {renderTile(mediaIds[0], 0)}
      </div>
    );
  }

  if (effective === 'two-col') {
    return (
      <div className="grid grid-cols-2 gap-1.5 aspect-[4/3] w-full overflow-hidden rounded-2xl">
        {renderTile(mediaIds[0], 0)}
        {renderTile(mediaIds[1], 1)}
      </div>
    );
  }

  if (effective === 'two-row') {
    return (
      <div className="grid grid-rows-2 gap-1.5 aspect-[4/3] w-full overflow-hidden rounded-2xl">
        {renderTile(mediaIds[0], 0)}
        {renderTile(mediaIds[1], 1)}
      </div>
    );
  }

  if (effective === 'three-mosaic') {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-1.5 aspect-[4/3] w-full overflow-hidden rounded-2xl">
        {renderTile(mediaIds[0], 0)}
        {renderTile(mediaIds[1], 1)}
        {renderTile(mediaIds[2], 2, 'col-span-2')}
      </div>
    );
  }

  if (effective === 'three-top') {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-1.5 aspect-[4/3] w-full overflow-hidden rounded-2xl">
        {renderTile(mediaIds[0], 0, 'col-span-2')}
        {renderTile(mediaIds[1], 1)}
        {renderTile(mediaIds[2], 2)}
      </div>
    );
  }

  if (effective === 'three-left') {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-1.5 aspect-[4/3] w-full overflow-hidden rounded-2xl">
        {renderTile(mediaIds[0], 0, 'row-span-2')}
        {renderTile(mediaIds[1], 1)}
        {renderTile(mediaIds[2], 2)}
      </div>
    );
  }

  if (effective === 'four-hero') {
    return (
      <div className="grid grid-cols-3 grid-rows-3 gap-1.5 aspect-[4/3] w-full overflow-hidden rounded-2xl">
        {renderTile(mediaIds[0], 0, 'col-span-2 row-span-3')}
        {renderTile(mediaIds[1], 1)}
        {renderTile(mediaIds[2], 2)}
        {renderTile(mediaIds[3], 3)}
      </div>
    );
  }

  // four-grid
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-1.5 aspect-[4/3] w-full overflow-hidden rounded-2xl">
      {mediaIds.slice(0, 4).map((id, idx) => renderTile(id, idx))}
    </div>
  );
};
