import QRCode from "qrcode";

const el = () => document.getElementById("pairing")!;

export async function showPairing(wsUrl: string): Promise<void> {
  const img = await QRCode.toDataURL(wsUrl, { margin: 1, width: 200 });
  el().innerHTML = `<img src="${img}" alt="QR"><div>Telefonla okut</div><code>${wsUrl}</code>`;
  el().style.display = "flex";
}

export function hidePairing(): void {
  el().style.display = "none";
}
