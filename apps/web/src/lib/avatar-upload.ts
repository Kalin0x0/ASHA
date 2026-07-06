/**
 * Client-side avatar processing. There is no upload/object-storage backend, so
 * we resize the chosen photo to a small square in the browser and store it as a
 * data-URL in `User.avatarUrl` (the CSP allows `img-src 'self' data:`). Keeping
 * it to 256×256 JPEG keeps the encoded string well under the API's size cap.
 */

const MAX_INPUT_BYTES = 8 * 1024 * 1024; // reject huge originals before decoding
const OUTPUT_SIZE = 256;

export class AvatarError extends Error {}

/** Read + cover-crop + resize an image File to a 256×256 JPEG data-URL. */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new AvatarError('not-an-image');
  if (file.size > MAX_INPUT_BYTES) throw new AvatarError('too-large');

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(bitmapUrl);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AvatarError('no-canvas');

    // Cover-crop: scale so the shorter side fills the square, center the rest.
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new AvatarError('decode-failed'));
    img.src = src;
  });
}
