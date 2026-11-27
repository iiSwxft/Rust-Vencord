// @description Client-side AES-256 end-to-end message encryption, wire-compatible with the vencord version
// @version 1.0.0
// @author iiSwxft

// adaptation: quickjs has no webcrypto, so PBKDF2-HMAC-SHA256 + AES-256-GCM are
// implemented in pure js below, same parameters as the vencord plugin, so both
// clients can read each other's messages. outgoing text is encrypted through
// messages.onSend, incoming ciphertext is decrypted in a before-hook

const settings = phoenix.settings.define({
  secretKey: {
    type: "secret",
    title: "Shared key",
    description: "Shared AES-256 encryption key (share with friends who have the plugin)",
    default: "",
  },
  prefix: {
    type: "text",
    title: "Encrypted message prefix",
    default: "🔒",
  },
  plainMarker: {
    type: "text",
    title: "Plaintext bypass marker",
    description: "Messages starting with this are sent unencrypted",
    default: "//",
  },
});

// utf-8 encode/decode without TextEncoder/TextDecoder
function utf8encode(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Uint8Array.from(out);
}

function utf8decode(bytes) {
  const parts = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let c;
    if (b < 0x80) { c = b; i += 1; }
    else if (b < 0xe0) { c = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f); i += 2; }
    else if (b < 0xf0) { c = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f); i += 3; }
    else { c = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f); i += 4; }
    if (c <= 0xffff) parts.push(String.fromCharCode(c));
    else {
      c -= 0x10000;
      parts.push(String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff)));
    }
  }
  return parts.join("");
}

// sha-256 over a Uint8Array
const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256(data) {
  const bitLen = data.length * 8;
  const len = ((data.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(len);
  buf.set(data);
  buf[data.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(len - 4, bitLen >>> 0);
  dv.setUint32(len - 8, Math.floor(bitLen / 0x100000000));
  const w = new Array(64);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let off = 0; off < len; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15], y = w[t - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((hh, i) => odv.setUint32(i * 4, hh >>> 0));
  return out;
}

function hmacSha256(key, data) {
  const k = key.length > 64 ? sha256(key) : key;
  const ipad = new Uint8Array(64).fill(0x36);
  const opad = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < k.length; i++) { ipad[i] ^= k[i]; opad[i] ^= k[i]; }
  return sha256(new Uint8Array([...opad, ...sha256(new Uint8Array([...ipad, ...data]))]));
}

function pbkdf2(password, salt, iterations, keyLen) {
  const out = new Uint8Array(keyLen);
  let block = 1, offset = 0;
  while (offset < keyLen) {
    const saltBlock = new Uint8Array(salt.length + 4);
    saltBlock.set(salt);
    new DataView(saltBlock.buffer).setUint32(salt.length, block);
    let u = hmacSha256(password, saltBlock);
    let t = u.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmacSha256(password, u);
      for (let j = 0; j < 32; j++) t[j] ^= u[j];
    }
    out.set(t.subarray(0, Math.min(32, keyLen - offset)), offset);
    offset += 32;
    block++;
  }
  return out;
}

// aes-256 in counter mode plus ghash for gcm
const SBOX = (() => {
  const s = new Uint8Array(256);
  let p = 1, q = 1;
  do {
    p = (p ^ ((p << 1) & 0xff) ^ ((p & 0x80) ? 0x1b : 0)) & 0xff;
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const rot = (n) => (((q << n) & 0xff) | (q >> (8 - n)));
    s[p] = (0x63 ^ q ^ rot(1) ^ rot(2) ^ rot(3) ^ rot(4)) & 0xff;
  } while (p !== 1);
  s[0] = 0x63;
  return s;
})();

const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d];

function xtime(x) { return ((x << 1) ^ ((x & 0x80) ? 0x1b : 0)) & 0xff; }

function aesExpandKey(key) {
  const nk = key.length / 4;
  const nr = nk + 6;
  const w = [];
  for (let i = 0; i < nk; i++) w.push(key.slice(i * 4, i * 4 + 4));
  for (let i = nk; i < 4 * (nr + 1); i++) {
    let temp = Uint8Array.from(w[i - 1]);
    if (i % nk === 0) {
      temp = Uint8Array.from([SBOX[temp[1]], SBOX[temp[2]], SBOX[temp[3]], SBOX[temp[0]]]);
      temp[0] ^= RCON[i / nk - 1];
    } else if (nk > 6 && i % nk === 4) {
      temp = Uint8Array.from(temp.map((b) => SBOX[b]));
    }
    const word = new Uint8Array(4);
    for (let j = 0; j < 4; j++) word[j] = w[i - nk][j] ^ temp[j];
    w.push(word);
  }
  return { w, nr };
}

function aesEncryptBlock(block, expanded) {
  const { w, nr } = expanded;
  let s = new Uint8Array(block);
  for (let r = 0; r <= nr; r++) {
    if (r > 0) {
      s = Uint8Array.from(s.map((b) => SBOX[b]));
      s = Uint8Array.from([s[0], s[5], s[10], s[15], s[4], s[9], s[14], s[3], s[8], s[13], s[2], s[7], s[12], s[1], s[6], s[11]]);
      if (r < nr) {
        const c = [];
        for (let col = 0; col < 4; col++) {
          const b0 = s[col * 4], b1 = s[col * 4 + 1], b2 = s[col * 4 + 2], b3 = s[col * 4 + 3];
          c.push(xtime(b0) ^ xtime(b1) ^ b1 ^ b2 ^ b3);
          c.push(b0 ^ xtime(b1) ^ xtime(b2) ^ b2 ^ b3);
          c.push(b0 ^ b1 ^ xtime(b2) ^ xtime(b3) ^ b3);
          c.push(xtime(b0) ^ b0 ^ b1 ^ b2 ^ xtime(b3));
        }
        s = Uint8Array.from(c);
      }
    }
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 4 + (i >> 2)][i % 4];
  }
  return s;
}

// ghash multiplication in GF(2^128)
function gfMul(x, y) {
  const z = new Uint8Array(16);
  let v = Uint8Array.from(y);
  for (let i = 0; i < 16; i++) {
    for (let bit = 0; bit < 8; bit++) {
      if ((x[i] >> (7 - bit)) & 1) {
        for (let j = 0; j < 16; j++) z[j] ^= v[j];
      }
      const carry = v[15] & 1;
      for (let j = 15; j > 0; j--) v[j] = ((v[j] >>> 1) | ((v[j - 1] & 1) << 7)) & 0xff;
      v[0] >>>= 1;
      if (carry) v[0] ^= 0xe1;
    }
  }
  return z;
}

function ghash(h, aad, ciphertext) {
  const hBytes = h;
  let y = new Uint8Array(16);
  const feed = (block) => {
    for (let i = 0; i < 16; i++) y[i] ^= block[i];
    y = gfMul(y, hBytes);
  };
  const pad16 = (data) => {
    for (let off = 0; off < data.length; off += 16) {
      const block = new Uint8Array(16);
      block.set(data.subarray(off, Math.min(off + 16, data.length)));
      feed(block);
    }
  };
  pad16(aad);
  pad16(ciphertext);
  const lens = new Uint8Array(16);
  const dv = new DataView(lens.buffer);
  dv.setUint32(4, aad.length * 8);
  dv.setUint32(12, ciphertext.length * 8);
  feed(lens);
  return y;
}

function aesGcmEncrypt(key, iv, plaintext) {
  const expanded = aesExpandKey(key);
  const h = aesEncryptBlock(new Uint8Array(16), expanded);
  const j0 = Uint8Array.from([...iv, 0, 0, 0, 1]);
  const ciphertext = new Uint8Array(plaintext.length);
  const counter = new Uint8Array(j0);
  for (let off = 0; off < plaintext.length; off += 16) {
    // increment counter (last 32 bits)
    for (let i = 15; i >= 12; i--) {
      counter[i] = (counter[i] + 1) & 0xff;
      if (counter[i] !== 0) break;
    }
    const ks = aesEncryptBlock(counter, expanded);
    const chunk = plaintext.subarray(off, Math.min(off + 16, plaintext.length));
    for (let i = 0; i < chunk.length; i++) ciphertext[off + i] = chunk[i] ^ ks[i];
  }
  const tagFull = ghash(h, new Uint8Array(0), ciphertext);
  const ej0 = aesEncryptBlock(j0, expanded);
  const tag = new Uint8Array(16);
  for (let i = 0; i < 16; i++) tag[i] = tagFull[i] ^ ej0[i];
  return { ciphertext, tag };
}

function aesGcmDecrypt(key, iv, ciphertext, tag) {
  const expanded = aesExpandKey(key);
  const h = aesEncryptBlock(new Uint8Array(16), expanded);
  const j0 = Uint8Array.from([...iv, 0, 0, 0, 1]);
  const tagFull = ghash(h, new Uint8Array(0), ciphertext);
  const ej0 = aesEncryptBlock(j0, expanded);
  for (let i = 0; i < 16; i++) {
    if ((tagFull[i] ^ ej0[i]) !== tag[i]) throw new Error("bad key or corrupted message");
  }
  const plaintext = new Uint8Array(ciphertext.length);
  const counter = new Uint8Array(j0);
  for (let off = 0; off < ciphertext.length; off += 16) {
    for (let i = 15; i >= 12; i--) {
      counter[i] = (counter[i] + 1) & 0xff;
      if (counter[i] !== 0) break;
    }
    const ks = aesEncryptBlock(counter, expanded);
    const chunk = ciphertext.subarray(off, Math.min(off + 16, ciphertext.length));
    for (let i = 0; i < chunk.length; i++) plaintext[off + i] = chunk[i] ^ ks[i];
  }
  return plaintext;
}

// pbkdf2 secret -> aes key, same as the vencord plugin (salt "vencord-e2e", 100k iterations).
// 100k pure-js hmac rounds take tens of seconds, so the derived key is cached on disk
let cachedKey = null;
let cachedSecret = null;
function getKey(secret) {
  if (cachedKey && cachedSecret === secret) return cachedKey;
  const stored = phoenix.storage.get(`key:${secret}`);
  if (stored) {
    cachedKey = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  } else {
    cachedKey = pbkdf2(utf8encode(secret), utf8encode("vencord-e2e"), 100000, 32);
    phoenix.storage.set(`key:${secret}`, btoa(String.fromCharCode(...cachedKey)));
  }
  cachedSecret = secret;
  return cachedKey;
}

function randomBytes(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function encryptMsg(text, secret) {
  const key = getKey(secret);
  const iv = randomBytes(12);
  const { ciphertext, tag } = aesGcmEncrypt(key, iv, utf8encode(text));
  const combined = new Uint8Array(12 + ciphertext.length + 16);
  combined.set(iv);
  combined.set(ciphertext, 12);
  combined.set(tag, 12 + ciphertext.length);
  return btoa(String.fromCharCode(...combined));
}

function decryptMsg(b64, secret) {
  const key = getKey(secret);
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const tag = combined.slice(combined.length - 16);
  const data = combined.slice(12, combined.length - 16);
  return utf8decode(aesGcmDecrypt(key, iv, data, tag));
}

const decryptCache = new Map();

function tryDecrypt(content) {
  if (!settings.secretKey || !content?.startsWith(settings.prefix)) return null;
  const b64 = content.slice(settings.prefix.length);
  if (decryptCache.has(b64)) return decryptCache.get(b64);
  try {
    const text = decryptMsg(b64, settings.secretKey);
    decryptCache.set(b64, text);
    return text;
  } catch {
    return null;
  }
}

const scrub = (message) => {
  const plain = tryDecrypt(message?.content);
  if (plain !== null) message.content = `${settings.prefix} ${plain}`;
};

phoenix.hook(phoenix.gateway.messageCreate, { before: scrub });
phoenix.hook(phoenix.gateway.messageUpdate, { before: scrub });

phoenix.messages.onSend((text) => {
  if (!settings.secretKey) return;
  if (text.startsWith(settings.plainMarker)) return text.slice(settings.plainMarker.length);
  if (text.startsWith(settings.prefix)) return;
  try {
    return settings.prefix + encryptMsg(text, settings.secretKey);
  } catch (err) {
    phoenix.log.error(`encryption failed: ${err}`);
    return false;
  }
});

phoenix.commands.register({
  name: "enc",
  description: "Send an encrypted message explicitly: /enc <text>",
  execute(args) {
    if (!settings.secretKey || !args.trim()) return;
    try {
      return settings.prefix + encryptMsg(args, settings.secretKey);
    } catch (err) {
      phoenix.log.error(`encryption failed: ${err}`);
    }
  },
});

phoenix.commands.register({
  name: "encselftest",
  description: "Verify the pure-js AES-GCM against a fixed WebCrypto test vector",
  execute(_args, ctx) {
    // fixed vector made with real webcrypto: plaintext "hello phoenix e2e", key "testkey-phoenix"
    const TEST_VECTOR = "ExJPIGxm42a80WqSSR9Qqq1vEXulvysIiMEgvlBxUIwMILC8n+1cuqPLitUJ";
    try {
      const out = decryptMsg(TEST_VECTOR, "testkey-phoenix");
      ctx.reply(out === "hello phoenix e2e" ? "crypto self-test PASS" : `FAIL (got "${out}")`);
    } catch (err) {
      ctx.reply(`crypto self-test FAIL (${err})`);
    }
  },
});

phoenix.onUnload(() => {
  decryptCache.clear();
  cachedKey = null;
  cachedSecret = null;
});
