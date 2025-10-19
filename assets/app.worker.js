importScripts('https://unpkg.com/@zxing/library@latest/umd/index.min.js');

const reader = new ZXing.MultiFormatReader();
const hints = new Map();

hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
  ZXing.BarcodeFormat.QR_CODE,
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.CODE_39,
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.EAN_8,
  ZXing.BarcodeFormat.UPC_A,
  ZXing.BarcodeFormat.UPC_E,
  ZXing.BarcodeFormat.ITF
]);
reader.setHints(hints);

self.onmessage = (e) => {
  const { cmd, width, height, data } = e.data || {};
  if (cmd !== 'decode') return;
  try {
    const rgba = new Uint8ClampedArray(data);
    const gray = new Uint8ClampedArray(width * height);

    // Calcula o brilho médio da imagem para ajustar o contraste
    let totalBrightness = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
      totalBrightness += brightness;
    }
    const averageBrightness = totalBrightness / (width * height);

    // Converte para tons de cinza e aplica o ajuste de contraste
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      let brightness = (r * 0.299 + g * 0.587 + b * 0.114);

      if (brightness < averageBrightness) {
        brightness = Math.max(0, brightness - 30);
      } else {
        brightness = Math.min(255, brightness + 30);
      }

      gray[j] = brightness | 0;
    }

    const luminanceSource = new ZXing.RGBLuminanceSource(gray, width, height);
    const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource));
    const result = reader.decode(binaryBitmap);

    const pts = (result.getResultPoints() || []).map(p => ({ x: p.getX(), y: p.getY() }));
    self.postMessage({
      ok: true,
      text: result.getText(),
      format: result.getBarcodeFormat(),
      points: pts
    });

  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};