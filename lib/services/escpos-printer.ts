/**
 * Web Bluetooth ESC/POS Direct Thermal Printer Utility
 * Mendukung printer thermal 58mm (32 kolom) dan 80mm (48 kolom)
 * Mengirimkan raw ESC/POS binary command via Bluetooth Low Energy (BLE) / Web Bluetooth
 */

export type PrinterWidth = 58 | 80;

export interface ReceiptData {
  storeName: string;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
  orderNumber: string;
  cashierName?: string;
  tableName?: string;
  diningType?: "dine_in" | "takeaway";
  date: string | Date;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    notes?: string;
  }>;
  subtotal: number;
  discountAmount?: number;
  taxAmount?: number;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  changeAmount?: number;
  verificationCode?: string;
  footerMessage?: string;
}

// Well-known Bluetooth Thermal Printer Service & Characteristic UUIDs
const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // Standard ESC/POS Service
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Common China POS BLE
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC BLE POS
  "0000ff00-0000-1000-8000-00805f9b34fb", // General BLE Serial
];

interface BluetoothCharacteristicLike {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue?: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
}

interface BluetoothServiceLike {
  getCharacteristics: () => Promise<BluetoothCharacteristicLike[]>;
}

interface BluetoothRemoteGATTServerLike {
  connected?: boolean;
  connect: () => Promise<BluetoothRemoteGATTServerLike>;
  disconnect?: () => void;
  getPrimaryService: (service: string) => Promise<BluetoothServiceLike>;
  getPrimaryServices?: () => Promise<BluetoothServiceLike[]>;
}

interface BluetoothDeviceLike {
  name?: string;
  gatt?: BluetoothRemoteGATTServerLike;
  addEventListener: (event: string, handler: () => void) => void;
}

interface NavigatorWithBluetooth {
  bluetooth: {
    requestDevice: (options: { acceptAllDevices?: boolean; optionalServices?: string[] }) => Promise<BluetoothDeviceLike>;
  };
}

let connectedDevice: BluetoothDeviceLike | null = null;
let printerCharacteristic: BluetoothCharacteristicLike | null = null;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function isPrinterConnected(): boolean {
  return !!(connectedDevice && connectedDevice.gatt?.connected && printerCharacteristic);
}

export function getConnectedPrinterName(): string | null {
  if (connectedDevice && connectedDevice.gatt?.connected) {
    return connectedDevice.name || "Bluetooth Thermal Printer";
  }
  return null;
}

/**
 * Scan & Hubungkan ke Printer Thermal Bluetooth
 */
export async function connectBluetoothPrinter(): Promise<string> {
  if (!isBluetoothSupported()) {
    throw new Error("Web Bluetooth tidak didukung di browser ini. Gunakan Chrome/Edge di Android/Windows/Mac.");
  }

  try {
    const nav = navigator as unknown as NavigatorWithBluetooth;
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });

    if (!device || !device.gatt) throw new Error("Tidak ada printer yang dipilih.");

    const server = await device.gatt.connect();

    // Cari characteristic yang dapat menerima write command
    let foundChar: BluetoothCharacteristicLike | null = null;
    for (const serviceUuid of PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            foundChar = char;
            break;
          }
        }
        if (foundChar) break;
      } catch {
        // Coba service berikutnya
      }
    }

    if (!foundChar && server.getPrimaryServices) {
      // Coba fallback ambil service apapun yang tersedia
      const services = await server.getPrimaryServices();
      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              foundChar = char;
              break;
            }
          }
          if (foundChar) break;
        } catch {
          // Continue
        }
      }
    }

    if (!foundChar) {
      throw new Error("Gagal menemukan saluran data printer yang kompatibel.");
    }

    connectedDevice = device;
    printerCharacteristic = foundChar;

    device.addEventListener("gattserverdisconnected", () => {
      connectedDevice = null;
      printerCharacteristic = null;
    });

    return device.name || "Bluetooth Thermal Printer";
  } catch (error) {
    connectedDevice = null;
    printerCharacteristic = null;
    throw error;
  }
}

/**
 * Putus koneksi printer
 */
export function disconnectBluetoothPrinter(): void {
  if (connectedDevice && connectedDevice.gatt?.connected) {
    connectedDevice.gatt.disconnect?.();
  }
  connectedDevice = null;
  printerCharacteristic = null;
}

/**
 * ESC/POS Command Generator
 */
class EscPosBuilder {
  private buffer: number[] = [];
  private cols: number;

  constructor(width: PrinterWidth = 58) {
    this.cols = width === 80 ? 48 : 32;
    this.init();
  }

  init(): this {
    // ESC @ (Initialize printer)
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  align(alignment: "left" | "center" | "right"): this {
    // ESC a n (0: left, 1: center, 2: right)
    const n = alignment === "center" ? 1 : alignment === "right" ? 2 : 0;
    this.buffer.push(0x1b, 0x61, n);
    return this;
  }

  bold(enable = true): this {
    // ESC E n (1: bold, 0: normal)
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0);
    return this;
  }

  textSize(doubleWidth = false, doubleHeight = false): this {
    // GS ! n (Character size)
    let n = 0;
    if (doubleWidth) n |= 0x20;
    if (doubleHeight) n |= 0x01;
    this.buffer.push(0x1d, 0x21, n);
    return this;
  }

  text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    for (const b of bytes) {
      this.buffer.push(b);
    }
    return this;
  }

  line(str = ""): this {
    this.text(str);
    this.buffer.push(0x0a); // LF
    return this;
  }

  divider(char = "-"): this {
    return this.line(char.repeat(this.cols));
  }

  twoColumn(left: string, right: string, bold = false): this {
    if (bold) this.bold(true);
    const spaceCount = this.cols - (left.length + right.length);
    if (spaceCount < 1) {
      const trimmedLeft = left.slice(0, Math.max(1, this.cols - right.length - 2)) + "..";
      const spaces = Math.max(1, this.cols - (trimmedLeft.length + right.length));
      this.line(trimmedLeft + " ".repeat(spaces) + right);
    } else {
      this.line(left + " ".repeat(spaceCount) + right);
    }
    if (bold) this.bold(false);
    return this;
  }

  feed(lines = 3): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  cut(): this {
    // GS V 66 0 (Partial cut / Feed & Cut)
    this.buffer.push(0x1d, 0x56, 0x42, 0x00);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Format & Build Raw ESC/POS Receipt Bytes
 */
export function buildReceiptEscPos(data: ReceiptData, width: PrinterWidth = 58): Uint8Array {
  const rupiahFmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
  const builder = new EscPosBuilder(width);

  // 1. Store Header
  builder
    .align("center")
    .bold(true)
    .textSize(true, true)
    .line(data.storeName.toUpperCase())
    .textSize(false, false)
    .bold(false);

  if (data.branchName) {
    builder.line(data.branchName);
  }
  if (data.branchAddress) {
    builder.line(data.branchAddress);
  }
  if (data.branchPhone) {
    builder.line(`Telp: ${data.branchPhone}`);
  }

  builder.divider("=");

  // 2. Order Metadata
  builder.align("left");
  const dt = typeof data.date === "string" ? new Date(data.date) : data.date;
  builder.twoColumn("Tgl:", dt.toLocaleString("id-ID"));
  builder.twoColumn("No. Order:", `#${data.orderNumber}`);
  if (data.cashierName) {
    builder.twoColumn("Kasir:", data.cashierName);
  }
  if (data.tableName) {
    builder.twoColumn("Meja:", `${data.tableName} (${data.diningType === "takeaway" ? "Takeaway" : "Dine In"})`);
  }

  builder.divider("-");

  // 3. Itemized Products
  for (const item of data.items) {
    const itemTotal = item.quantity * item.price;
    builder.twoColumn(`${item.quantity}x ${item.name}`, rupiahFmt(itemTotal));
    if (item.notes) {
      builder.line(`   * ${item.notes}`);
    }
  }

  builder.divider("-");

  // 4. Financial Totals
  builder.twoColumn("Subtotal", rupiahFmt(data.subtotal));
  if (data.discountAmount && data.discountAmount > 0) {
    builder.twoColumn("Diskon", `-${rupiahFmt(data.discountAmount)}`);
  }
  if (data.taxAmount && data.taxAmount > 0) {
    builder.twoColumn("Pajak / PPN", rupiahFmt(data.taxAmount));
  }

  builder.divider("=");
  builder.textSize(true, false).bold(true);
  builder.twoColumn("TOTAL", rupiahFmt(data.total), true);
  builder.textSize(false, false).bold(false);
  builder.divider("-");

  // 5. Payment Details
  builder.twoColumn("Metode Bayar:", data.paymentMethod);
  if (data.cashReceived !== undefined && data.cashReceived > 0) {
    builder.twoColumn("Uang Diterima:", rupiahFmt(data.cashReceived));
  }
  if (data.changeAmount !== undefined && data.changeAmount > 0) {
    builder.twoColumn("Kembalian:", rupiahFmt(data.changeAmount), true);
  }

  // 6. Verification / Footer
  if (data.verificationCode) {
    builder.divider("-");
    builder.align("center").line(`Kode Verifikasi: ${data.verificationCode}`);
  }

  builder
    .feed(1)
    .align("center")
    .line(data.footerMessage || "Terima kasih atas kunjungan Anda!")
    .line("Semoga harimu menyenangkan 😊")
    .feed(3)
    .cut();

  return builder.build();
}

/**
 * Kirim raw byte ESC/POS langsung ke printer Bluetooth
 */
export async function printDirectThermal(data: ReceiptData, width: PrinterWidth = 58): Promise<void> {
  if (!isPrinterConnected()) {
    // Buka dialog koneksi jika belum terhubung
    await connectBluetoothPrinter();
  }

  if (!printerCharacteristic) {
    throw new Error("Printer belum terhubung via Bluetooth.");
  }

  const rawBytes = buildReceiptEscPos(data, width);

  // Kirim data dalam chunks 128 bytes (standar BLE MTU buffer)
  const CHUNK_SIZE = 128;
  for (let i = 0; i < rawBytes.length; i += CHUNK_SIZE) {
    const chunk = rawBytes.slice(i, i + CHUNK_SIZE);
    if (printerCharacteristic.writeValueWithoutResponse) {
      await printerCharacteristic.writeValueWithoutResponse(chunk);
    } else if (printerCharacteristic.writeValue) {
      await printerCharacteristic.writeValue(chunk);
    }
    // Delay 20ms agar buffer printer tidak overflow
    await new Promise((r) => setTimeout(r, 20));
  }
}
