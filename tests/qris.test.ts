import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeQrisCRC16, parseQrisTags, injectAmountToQris } from "../lib/qris";

describe("QRIS Dynamic Generator & Parser", () => {
  // A standard Indonesian QRIS static payload template (BCA / GoPay / DANA / QRIS MPM standard)
  const sampleStaticQris =
    "00020101021126510011ID.DANA.WWW0118936009153123456789021012345678905204581253033605802ID5915KEDAI-KU POS ID6007JAKARTA61051234062070703A016304A1B2";

  it("computes standard CRC-16-CCITT correctly", () => {
    const data = "0002010102116304";
    const crc = computeQrisCRC16(data);
    assert.equal(typeof crc, "string");
    assert.equal(crc.length, 4);
  });

  it("parses TLV tags accurately", () => {
    const tags = parseQrisTags(sampleStaticQris);
    assert.ok(tags.length >= 7);
    const tag00 = tags.find((t) => t.tag === "00");
    const tag01 = tags.find((t) => t.tag === "01");
    assert.equal(tag00?.value, "01");
    assert.equal(tag01?.value, "11");
  });

  it("injects exact amount and converts static QRIS to dynamic QRIS", () => {
    const dynamicQris = injectAmountToQris(sampleStaticQris, 99000);
    assert.ok(dynamicQris.startsWith("000201"));
    assert.ok(dynamicQris.includes("010212")); // Tag 01 set to 12 (Dynamic)
    assert.ok(dynamicQris.includes("540599000")); // Tag 54 set to 99000 with length 05
    assert.ok(dynamicQris.includes("5303360")); // Currency 360 (IDR)
    assert.ok(dynamicQris.includes("5802ID")); // Country ID

    // Ensure valid CRC at end
    const lastPart = dynamicQris.slice(-8);
    assert.ok(lastPart.startsWith("6304"));
    const crcActual = lastPart.slice(4);
    const crcCalculated = computeQrisCRC16(dynamicQris.slice(0, -4));
    assert.equal(crcActual, crcCalculated);
  });

  it("handles decimal/floating amount rounding properly", () => {
    const dynamicQris = injectAmountToQris(sampleStaticQris, 350000.45);
    assert.ok(dynamicQris.includes("5406350000"));
  });

  it("preserves non-QRIS strings safely without crashing", () => {
    const invalid = "https://example.com/payment";
    assert.equal(injectAmountToQris(invalid, 99000), invalid);
  });
});
