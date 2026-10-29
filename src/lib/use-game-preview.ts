import { useEffect, useState } from 'react';
import { IS_NDS } from '../platform';

/** Derive library artwork only; full screenshots and checkpoint data stay intact. */
export function useGamePreview(source?: string): string | undefined {
  const [preview, setPreview] = useState<{ source: string; image: string }>();
  useEffect(() => {
    if (!IS_NDS || !source?.startsWith('data:image/')) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const horizontal = image.naturalWidth === 512 && image.naturalHeight === 192;
      const vertical = image.naturalWidth === 256 && image.naturalHeight === 384;
      if (!horizontal && !vertical) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const blank = (panel: number) => {
          const left = horizontal ? panel * 256 : 0;
          const top = vertical ? panel * 192 : 0;
          for (let y = 2; y < 192; y += 4) for (let x = 2; x < 256; x += 4) {
            const i = ((top + y) * canvas.width + left + x) * 4;
            if (pixels[i + 3] && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 12) return false;
          }
          return true;
        };
        const firstBlank = blank(0);
        if (firstBlank === blank(1)) return;
        const visible = firstBlank ? 1 : 0;
        canvas.width = 256;
        canvas.height = 192;
        context.drawImage(image, horizontal ? visible * 256 : 0, vertical ? visible * 192 : 0, 256, 192, 0, 0, 256, 192);
        if (!cancelled) setPreview({ source, image: canvas.toDataURL('image/png') });
      } catch { /* Keep the original artwork when preview decoding is unavailable. */ }
    };
    image.src = source;
    return () => { cancelled = true; image.onload = null; };
  }, [source]);
  return preview && preview.source === source ? preview.image : source;
}
