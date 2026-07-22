import { nativeImage } from "electron";
import type { NativeImage } from "electron";

const ICON_SIZE = 18;

export function createTrayIcon(): NativeImage {
  const bitmap = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
  for (let y = 0; y < ICON_SIZE; y += 1) {
    for (let x = 0; x < ICON_SIZE; x += 1) {
      const body = ((x - 8.5) ** 2) / 43 + ((y - 10) ** 2) / 27 <= 1;
      const leftEar = y >= 2 && y <= 8 && x >= 3 && x <= 7 && x - 3 <= 8 - y;
      const rightEar = y >= 2 && y <= 8 && x >= 10 && x <= 14 && 14 - x <= 8 - y;
      const eye = (y === 10 || y === 11) && (x === 6 || x === 11);
      if ((!body && !leftEar && !rightEar) || eye) continue;
      const offset = (y * ICON_SIZE + x) * 4;
      bitmap[offset] = 0;
      bitmap[offset + 1] = 0;
      bitmap[offset + 2] = 0;
      bitmap[offset + 3] = 255;
    }
  }
  const image = nativeImage.createFromBitmap(bitmap, {
    width: ICON_SIZE,
    height: ICON_SIZE,
    scaleFactor: 1
  });
  image.setTemplateImage(true);
  return image;
}
