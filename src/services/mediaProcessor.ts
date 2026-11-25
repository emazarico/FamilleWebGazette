export interface CompressedPhotoPair {
  fullBlob: Blob;
  thumbBlob: Blob;
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  byteSize: number;
  thumbByteSize: number;
}

const SUPPORTED_EXT_RE = /\.(heic|heif|jpe?g|png|webp|gif|avif|bmp)$/i;
const HEIC_EXT_RE = /\.(heic|heif)$/i;

export function isSupportedPhotoFile(file: Pick<File, 'type' | 'name'>): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  if (file.name && SUPPORTED_EXT_RE.test(file.name)) return true;
  return false;
}

export function isLikelyHeicFile(file: Blob): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('heic') || mime.includes('heif')) return true;
  const name = 'name' in file && typeof (file as File).name === 'string' ? (file as File).name : '';
  return HEIC_EXT_RE.test(name);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    } catch {
      resolve(null);
    }
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image file.'));
    img.src = src;
  });
}

function computeScaledDimensions(
  srcWidth: number,
  srcHeight: number,
  maxEdge: number,
): { width: number; height: number } {
  const w = Math.max(1, srcWidth);
  const h = Math.max(1, srcHeight);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

async function encodeScaled(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  maxEdge: number,
  quality: number,
): Promise<{ blob: Blob; mimeType: 'image/webp' | 'image/jpeg'; width: number; height: number }> {
  const { width, height } = computeScaledDimensions(srcWidth, srcHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);

  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp' && webp.size > 0) {
    return { blob: webp, mimeType: 'image/webp', width, height };
  }

  const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (jpeg && jpeg.size > 0) {
    return { blob: jpeg, mimeType: 'image/jpeg', width, height };
  }

  throw new Error('Failed to encode compressed image.');
}

async function decodeImageWithHeicFallback(
  file: Blob,
): Promise<{ img: HTMLImageElement; urlsToRevoke: string[] }> {
  const urlsToRevoke: string[] = [];
  const primaryUrl = URL.createObjectURL(file);
  urlsToRevoke.push(primaryUrl);

  try {
    const img = await loadImageElement(primaryUrl);
    return { img, urlsToRevoke };
  } catch (nativeErr) {
    const { isHeic, heicTo } = await import('heic-to');
    let heicDetected = isLikelyHeicFile(file);
    if (!heicDetected) {
      try {
        const fileObj =
          file instanceof File
            ? file
            : new File([file], 'photo.heic', { type: file.type || 'image/heic' });
        heicDetected = await isHeic(fileObj);
      } catch {
        heicDetected = false;
      }
    }
    if (!heicDetected) {
      throw nativeErr;
    }

    const convertedBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.92,
    });
    const convertedUrl = URL.createObjectURL(convertedBlob);
    urlsToRevoke.push(convertedUrl);
    const img = await loadImageElement(convertedUrl);
    return { img, urlsToRevoke };
  }
}

/**
 * Re-encodes a user-selected photo (including iPhone HEIC/HEIF) via <canvas> into:
 * - full: max 2048px long edge at quality 0.88 (crisp Retina Wall view & printable Gazettes)
 * - thumb: max 960px long edge at quality 0.84 (fast tray, gallery & email digest thumbnails)
 * Canvas drawing also normalizes EXIF orientation and strips GPS metadata for privacy.
 */
export async function compressPhotoPair(file: Blob): Promise<CompressedPhotoPair> {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return {
      fullBlob: file,
      thumbBlob: file,
      mimeType: 'image/jpeg',
      width: 1600,
      height: 1200,
      byteSize: file.size,
      thumbByteSize: file.size,
    };
  }

  let urlsToRevoke: string[] = [];
  try {
    const decoded = await decodeImageWithHeicFallback(file);
    urlsToRevoke = decoded.urlsToRevoke;
    const { img } = decoded;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    const full = await encodeScaled(img, srcW, srcH, 2048, 0.88);
    const thumb = await encodeScaled(img, srcW, srcH, 960, 0.84);

    return {
      fullBlob: full.blob,
      thumbBlob: thumb.blob,
      mimeType: full.mimeType,
      width: full.width,
      height: full.height,
      byteSize: full.blob.size,
      thumbByteSize: thumb.blob.size,
    };
  } finally {
    for (const u of urlsToRevoke) {
      if (u.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(u);
      }
    }
  }
}
