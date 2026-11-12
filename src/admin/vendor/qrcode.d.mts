// Types for the vendored QR generator (Kazuhiko Arase, MIT — header in qrcode.mjs). Admin bundle only.
export interface QrCode {
  addData(data: string): void;
  make(): void;
  createDataURL(cellSize?: number, margin?: number): string;
}
declare function qrcode(typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QrCode;
export default qrcode;
export { qrcode };
