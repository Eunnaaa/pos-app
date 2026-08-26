import "server-only";
import jsQR from "jsqr";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/**
 * Decode raw QR code payload string (EMVCo QRIS) from an image data URL (PNG/JPEG) or Buffer
 */
export function decodeQrisFromImageBuffer(buffer: Buffer): string | null {
  if (!buffer || buffer.length === 0) return null;

  // Try JPEG decoding
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    try {
      const decoded = jpeg.decode(buffer, { useTArray: true });
      const code = jsQR(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height);
      if (code?.data && code.data.startsWith("000201")) {
        return code.data;
      }
    } catch {
      // ignore
    }
  }

  // Try PNG decoding
  try {
    const png = PNG.sync.read(buffer);
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    if (code?.data && code.data.startsWith("000201")) {
      return code.data;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Decode QRIS payload from base64 data URL
 */
export function decodeQrisFromDataUrl(dataUrl: string): string | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  if (!dataUrl.startsWith("data:image/")) return null;

  try {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    return decodeQrisFromImageBuffer(buffer);
  } catch {
    return null;
  }
}
