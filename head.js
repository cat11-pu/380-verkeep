// head.js：报文头按位解析（高四位版本号、低四位保留位）
const FRAME_RE = /^[0-9a-fA-F]{2}$/;

export function isFrame(hex) {
  return typeof hex === "string" && FRAME_RE.test(hex);
}

export function versionOf(hex) {
  if (!isFrame(hex)) return -1;
  return parseInt(hex.charAt(0), 16);
}

export function reservedOf(hex) {
  if (!isFrame(hex)) return -1;
  return parseInt(hex.charAt(1), 16);
}
