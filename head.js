// head.js：报文头按位解析（形状不合法一律给负一）
export function versionOf(hex) {
  if (typeof hex !== "string" || !/^[0-9a-fA-F]{2}$/.test(hex)) return -1;
  return parseInt(hex.charAt(0), 16);
}

export function reservedOf(hex) {
  if (typeof hex !== "string" || !/^[0-9a-fA-F]{2}$/.test(hex)) return -1;
  return parseInt(hex.charAt(1), 16);
}
