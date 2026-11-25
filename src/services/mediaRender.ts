import type { MemoryPost, PhotoCrop } from '../types/family';
import { computeCropSourceRect } from '../utils/gazette';
import { demoMediaSvgDataUrl, getLocalMediaBlob, type MediaVariant } from './mediaStore';

export interface RasterizeMediaOptions {
  maxEdge?: number;
  quality?: number;
  crop?: Partial<PhotoCrop> | null;
  targetAspect?: number;
  variant?: MediaVariant;
}

function loadImgElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for PDF/HTML export.'));
    img.src = src;
  });
}

function computeTargetDimensions(
  srcW: number,
  srcH: number,
  maxEdge: number,
  targetAspect?: number,
): { outW: number; outH: number } {
  const aspect = targetAspect && targetAspect > 0 ? targetAspect : srcW / Math.max(1, srcH);
  if (aspect >= 1) {
    const outW = Math.max(1, Math.min(maxEdge, Math.round(targetAspect ? maxEdge : Math.max(srcW, maxEdge))));
    const clampedW = targetAspect ? maxEdge : Math.min(maxEdge, Math.max(1, srcW));
    const finalW = Math.max(1, targetAspect ? outW : clampedW);
    const finalH = Math.max(1, Math.round(finalW / aspect));
    return { outW: finalW, outH: finalH };
  }
  const outH = Math.max(1, targetAspect ? maxEdge : Math.min(maxEdge, Math.max(1, srcH)));
  const outW = Math.max(1, Math.round(outH * aspect));
  return { outW, outH };
}

/**
 * Renders any MediaAsset (including demo SVG illustrations or IndexedDB WebP/JPEG blobs)
 * into a cropped JPEG data URL ready for jsPDF addImage() or HTML email previews.
 */
export async function rasterizeMediaToJpeg(
  mediaId: string,
  options: RasterizeMediaOptions = {},
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof document === 'undefined') return null;

  const {
    maxEdge = 1200,
    quality = 0.85,
    crop = null,
    targetAspect,
    variant = 'full',
  } = options;

  let objectUrlToRevoke: string | null = null;
  try {
    let src = demoMediaSvgDataUrl(mediaId);
    if (!src) {
      const blob = await getLocalMediaBlob(mediaId, variant);
      if (!blob) return null;
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        objectUrlToRevoke = URL.createObjectURL(blob);
        src = objectUrlToRevoke;
      } else {
        return null;
      }
    }

    const img = await loadImgElement(src);
    const naturalW = Math.max(1, img.naturalWidth || img.width || 800);
    const naturalH = Math.max(1, img.naturalHeight || img.height || 600);
    const resolvedAspect = targetAspect && targetAspect > 0 ? targetAspect : naturalW / naturalH;

    const { sx, sy, sw, sh } = computeCropSourceRect(naturalW, naturalH, resolvedAspect, crop);
    const { outW, outH } = computeTargetDimensions(naturalW, naturalH, maxEdge, resolvedAspect);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { dataUrl, width: outW, height: outH };
  } catch {
    return null;
  } finally {
    if (objectUrlToRevoke && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
  }
}

/**
 * Builds compact JPEG data URLs for email digest previews and standalone HTML export.
 */
export async function buildEmailPreviewThumbnails(
  posts: MemoryPost[],
  maxTotalInlineBytes = 65_000,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let totalBytes = 0;

  for (const post of posts) {
    const firstId = post.mediaIds[0];
    if (!firstId || result[firstId]) continue;
    const rendered = await rasterizeMediaToJpeg(firstId, {
      maxEdge: 320,
      quality: 0.65,
      targetAspect: 4 / 3,
      crop: post.mediaCrops?.[firstId],
      variant: 'thumb',
    });
    if (!rendered) continue;
    if (totalBytes + rendered.dataUrl.length > maxTotalInlineBytes && Object.keys(result).length > 0) {
      break;
    }
    result[firstId] = rendered.dataUrl;
    totalBytes += rendered.dataUrl.length;
  }

  return result;
}
