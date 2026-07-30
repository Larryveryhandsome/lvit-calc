// OpenSSL 相容 AES-256-CBC 加密（與 Dart `encrypt` 套件產出格式一致）
// 原 App 程式碼在 lib/helper/encryption_helper.dart
//
// 輸出格式：base64( "Salted__" + salt(8) + ciphertext )
// 金鑰 / IV 產生：OpenSSL EVP_BytesToKey with MD5
//   D_i = MD5( D_{i-1} || password || salt )
//   取前 48 bytes → Key(32) + IV(16)
//
// 瀏覽器 Web Crypto 不提供 MD5，因此內嵌一份純 JS MD5 實作（~80 行）。

// ─── Pure JS MD5 (RFC 1321) ─────────────────────────────────
// Source: adapted from https://github.com/blueimp/JavaScript-MD5 (MIT)
// 為縮減體積而簡化，只保留 raw bytes 介面
function md5Bytes(bytes) {
  const x = bytesToWords(bytes);
  const len = bytes.length * 8;
  x[len >>> 5] |= 0x80 << (len % 32);
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < x.length; i += 16) {
    const olda = a, oldb = b, oldc = c, oldd = d;
    a = ff(a, b, c, d, x[i],       7, -680876936);
    d = ff(d, a, b, c, x[i + 1],  12, -389564586);
    c = ff(c, d, a, b, x[i + 2],  17,  606105819);
    b = ff(b, c, d, a, x[i + 3],  22, -1044525330);
    a = ff(a, b, c, d, x[i + 4],   7, -176418897);
    d = ff(d, a, b, c, x[i + 5],  12,  1200080426);
    c = ff(c, d, a, b, x[i + 6],  17, -1473231341);
    b = ff(b, c, d, a, x[i + 7],  22, -45705983);
    a = ff(a, b, c, d, x[i + 8],   7,  1770035416);
    d = ff(d, a, b, c, x[i + 9],  12, -1958414417);
    c = ff(c, d, a, b, x[i + 10], 17, -42063);
    b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12],  7,  1804603682);
    d = ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, x[i + 15], 22,  1236535329);

    a = gg(a, b, c, d, x[i + 1],   5, -165796510);
    d = gg(d, a, b, c, x[i + 6],   9, -1069501632);
    c = gg(c, d, a, b, x[i + 11], 14,  643717713);
    b = gg(b, c, d, a, x[i],      20, -373897302);
    a = gg(a, b, c, d, x[i + 5],   5, -701558691);
    d = gg(d, a, b, c, x[i + 10],  9,  38016083);
    c = gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = gg(b, c, d, a, x[i + 4],  20, -405537848);
    a = gg(a, b, c, d, x[i + 9],   5,  568446438);
    d = gg(d, a, b, c, x[i + 14],  9, -1019803690);
    c = gg(c, d, a, b, x[i + 3],  14, -187363961);
    b = gg(b, c, d, a, x[i + 8],  20,  1163531501);
    a = gg(a, b, c, d, x[i + 13],  5, -1444681467);
    d = gg(d, a, b, c, x[i + 2],   9, -51403784);
    c = gg(c, d, a, b, x[i + 7],  14,  1735328473);
    b = gg(b, c, d, a, x[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, x[i + 5],   4, -378558);
    d = hh(d, a, b, c, x[i + 8],  11, -2022574463);
    c = hh(c, d, a, b, x[i + 11], 16,  1839030562);
    b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1],   4, -1530992060);
    d = hh(d, a, b, c, x[i + 4],  11,  1272893353);
    c = hh(c, d, a, b, x[i + 7],  16, -155497632);
    b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13],  4,  681279174);
    d = hh(d, a, b, c, x[i],      11, -358537222);
    c = hh(c, d, a, b, x[i + 3],  16, -722521979);
    b = hh(b, c, d, a, x[i + 6],  23,  76029189);
    a = hh(a, b, c, d, x[i + 9],   4, -640364487);
    d = hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = hh(c, d, a, b, x[i + 15], 16,  530742520);
    b = hh(b, c, d, a, x[i + 2],  23, -995338651);

    a = ii(a, b, c, d, x[i],       6, -198630844);
    d = ii(d, a, b, c, x[i + 7],  10,  1126891415);
    c = ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, x[i + 5],  21, -57434055);
    a = ii(a, b, c, d, x[i + 12],  6,  1700485571);
    d = ii(d, a, b, c, x[i + 3],  10, -1894986606);
    c = ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = ii(b, c, d, a, x[i + 1],  21, -2054922799);
    a = ii(a, b, c, d, x[i + 8],   6,  1873313359);
    d = ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = ii(c, d, a, b, x[i + 6],  15, -1560198380);
    b = ii(b, c, d, a, x[i + 13], 21,  1309151649);
    a = ii(a, b, c, d, x[i + 4],   6, -145523070);
    d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, x[i + 2],  15,  718787259);
    b = ii(b, c, d, a, x[i + 9],  21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }
  return wordsToBytes([a, b, c, d]);
}
function cmn(q, a, b, x, s, t) {
  return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}
function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}
function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
function bytesToWords(b) {
  const w = [];
  for (let i = 0; i < b.length * 8; i += 8) {
    w[i >> 5] |= (b[i / 8] & 0xff) << (i % 32);
  }
  return w;
}
function wordsToBytes(w) {
  const b = [];
  for (let i = 0; i < w.length * 32; i += 8) {
    b.push((w[i >> 5] >>> (i % 32)) & 0xff);
  }
  return b;
}

// ─── EVP_BytesToKey with MD5 ────────────────────────────────
function evpBytesToKey(password, salt) {
  const passBytes = new TextEncoder().encode(password);
  const out = [];
  let last = [];
  while (out.length < 48) {
    const input = [...last, ...passBytes, ...salt];
    last = md5Bytes(input);
    out.push(...last);
  }
  return new Uint8Array(out.slice(0, 48));
}

// ─── Public API ─────────────────────────────────────────────
function utf8(s) { return new TextEncoder().encode(s); }
function bytesToB64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export async function encryptOpenSSL(plainObjOrString, password) {
  const plainStr = typeof plainObjOrString === "string"
    ? plainObjOrString
    : JSON.stringify(plainObjOrString);

  // 8 byte random salt
  const salt = new Uint8Array(8);
  crypto.getRandomValues(salt);

  const keyIv = evpBytesToKey(password, Array.from(salt));
  const keyBytes = keyIv.slice(0, 32);
  const ivBytes = keyIv.slice(32, 48);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: ivBytes },
    cryptoKey,
    utf8(plainStr),
  );
  const cipher = new Uint8Array(cipherBuf);

  const header = utf8("Salted__");
  const out = new Uint8Array(header.length + salt.length + cipher.length);
  out.set(header, 0);
  out.set(salt, header.length);
  out.set(cipher, header.length + salt.length);
  return bytesToB64(out);
}
