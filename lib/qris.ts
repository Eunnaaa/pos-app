/**
 * QRIS (Quick Response Code Indonesian Standard) Dynamic Generator & Parser
 * Complies with EMVCo Merchant-Presented Mode & Bank Indonesia QRIS Specifications
 */

/**
 * CRC-16-CCITT calculation using polynomial 0x1021, initial value 0xFFFF
 */
export function computeQrisCRC16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface QrisTag {
  tag: string;
  length: number;
  value: string;
}

/**
 * Parse an EMVCo QRIS string into a list of sequential Tag-Length-Value tuples
 */
export function parseQrisTags(qrisString: string): QrisTag[] {
  const tags: QrisTag[] = [];
  let i = 0;
  while (i < qrisString.length) {
    if (i + 4 > qrisString.length) break;
    const tag = qrisString.substring(i, i + 2);
    const lenStr = qrisString.substring(i + 2, i + 4);
    const len = parseInt(lenStr, 10);
    if (isNaN(len) || len < 0) break;
    const value = qrisString.substring(i + 4, i + 4 + len);
    tags.push({ tag, length: len, value });
    i += 4 + len;
  }
  return tags;
}

/**
 * Inject or replace the nominal transaction amount in any standard QRIS string,
 * turning a static QRIS into a Dynamic QRIS (Tag 01 = '12', Tag 54 = amount).
 * When scanned by m-Banking (BCA, Mandiri, BRI, BNI) or e-Wallets (GoPay, OVO, DANA, ShopeePay),
 * the payment app will automatically lock the exact invoice amount!
 */
export function injectAmountToQris(rawQris: string, amount: number): string {
  if (!rawQris || typeof rawQris !== "string" || !rawQris.startsWith("000201")) {
    return rawQris;
  }

  // Strip trailing CRC Tag 63 if present
  let cleanQris = rawQris.trim();
  const tag63Idx = cleanQris.lastIndexOf("6304");
  if (tag63Idx !== -1 && tag63Idx >= cleanQris.length - 8) {
    cleanQris = cleanQris.substring(0, tag63Idx);
  }

  const tags = parseQrisTags(cleanQris);
  const amountValue = Math.round(amount).toString();

  let hasTag01 = false;
  let hasTag54 = false;
  let hasTag53 = false;
  let hasTag58 = false;

  // Modify in-place or record presence
  for (const item of tags) {
    if (item.tag === "01") {
      item.value = "12"; // Set to Dynamic QR
      item.length = 2;
      hasTag01 = true;
    } else if (item.tag === "54") {
      item.value = amountValue;
      item.length = amountValue.length;
      hasTag54 = true;
    } else if (item.tag === "53") {
      hasTag53 = true;
    } else if (item.tag === "58") {
      hasTag58 = true;
    }
  }

  if (!hasTag01) {
    tags.splice(1, 0, { tag: "01", length: 2, value: "12" });
  }

  if (!hasTag53) {
    // 360 = IDR (Indonesian Rupiah)
    tags.push({ tag: "53", length: 3, value: "360" });
  }

  if (!hasTag54) {
    // Insert Tag 54 before Tag 58 if possible, else append
    const tag58Index = tags.findIndex((t) => t.tag === "58");
    const newTag54: QrisTag = { tag: "54", length: amountValue.length, value: amountValue };
    if (tag58Index !== -1) {
      tags.splice(tag58Index, 0, newTag54);
    } else {
      tags.push(newTag54);
    }
  }

  if (!hasTag58) {
    tags.push({ tag: "58", length: 2, value: "ID" });
  }

  // Filter out tag 63 if any slipped through
  const filtered = tags.filter((t) => t.tag !== "63");

  // Reassemble payload string
  let output = "";
  for (const t of filtered) {
    const lenStr = t.value.length.toString().padStart(2, "0");
    output += `${t.tag}${lenStr}${t.value}`;
  }

  // Append Tag 63 (CRC-16 indicator)
  output += "6304";

  // Calculate and append CRC-16 checksum
  const crc = computeQrisCRC16(output);
  return `${output}${crc}`;
}
