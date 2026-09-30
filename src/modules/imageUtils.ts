// ═══════════════════════════════════════════════════════════
// imageUtils — Prepara la foto de perfil (recorte cuadrado + reducción)
// ═══════════════════════════════════════════════════════════

import { BackendError } from './backend';

const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * Recorta al centro en cuadrado, reduce a `size`×`size` y codifica en WebP
 * (JPEG si el navegador no soporta WebP). Una foto típica queda en ~20 KB,
 * muy por debajo del límite de 512 KB del bucket.
 */
export async function prepareAvatar(file: File, size = 256): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    // SVG (scripts) y GIF (animado) no se aceptan
    throw new BackendError('invalid_file');
  }
  if (file.size > MAX_INPUT_BYTES) throw new BackendError('file_too_large');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new BackendError('invalid_file');
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new BackendError('invalid_file');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  const blob = (await encode('image/webp', 0.85)) ?? (await encode('image/jpeg', 0.88));
  if (!blob) throw new BackendError('invalid_file');
  return blob;
}
