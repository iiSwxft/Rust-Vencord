// cross-checks the plugin's pure-js crypto against node's webcrypto, layer by layer
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../phoenix-plugins/e2eEncrypt.js", import.meta.url), "utf8");

// lift the crypto section: everything between the settings define and "const decryptCache"
const start = src.indexOf("// utf-8 encode/decode");
const end = src.indexOf("const decryptCache");
const cryptoCode = src.slice(start, end);

const harness = eval(`(() => { ${cryptoCode}; return { sha256, pbkdf2, aesEncryptBlock, aesExpandKey, aesGcmEncrypt, aesGcmDecrypt, utf8encode }; })()`);

const hex = (u8) => Buffer.from(u8).toString("hex");

// 1. sha256
const sha = hex(harness.sha256(harness.utf8encode("abc")));
console.log("sha256(abc):", sha === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" ? "PASS" : `FAIL ${sha}`);

// 2. pbkdf2 vs node
import nodecrypto from "node:crypto";
const mine = hex(harness.pbkdf2(harness.utf8encode("password"), harness.utf8encode("salt"), 1, 32));
const ref = nodecrypto.pbkdf2Sync("password", "salt", 1, 32, "sha256").toString("hex");
console.log("pbkdf2 iter=1:", mine === ref ? "PASS" : `FAIL mine=${mine} ref=${ref}`);

// 3. aes-256 block vs fips-197 vector
const key = Uint8Array.from(Buffer.from("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", "hex"));
const pt = Uint8Array.from(Buffer.from("00112233445566778899aabbccddeeff", "hex"));
const ct = hex(harness.aesEncryptBlock(pt, harness.aesExpandKey(key)));
console.log("aes-256 block:", ct === "8ea2b7ca516745bfeafc49904b496089" ? "PASS" : `FAIL ${ct}`);

// 4. full aes-gcm vs webcrypto
const secret = "testkey-phoenix";
const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
const wck = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode("vencord-e2e"), iterations: 100000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
);
const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", wck));
const myKey = harness.pbkdf2(harness.utf8encode(secret), harness.utf8encode("vencord-e2e"), 100000, 32);
console.log("derived key match:", hex(myKey) === hex(rawKey) ? "PASS" : `FAIL mine=${hex(myKey)} ref=${hex(rawKey)}`);

const iv = new Uint8Array(12).fill(7);
const msg = harness.utf8encode("hello phoenix e2e");
const mine2 = harness.aesGcmEncrypt(myKey, iv, msg);
const wcCt = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wck, msg));
const mineFull = new Uint8Array([...mine2.ciphertext, ...mine2.tag]);
console.log("aes-gcm encrypt:", hex(mineFull) === hex(wcCt) ? "PASS" : `FAIL mine=${hex(mineFull)} ref=${hex(wcCt)}`);

try {
    const dec = harness.aesGcmDecrypt(myKey, iv, wcCt.slice(0, -16), wcCt.slice(-16));
    console.log("aes-gcm decrypt of webcrypto ct:", hex(dec) === hex(msg) ? "PASS" : `FAIL ${hex(dec)}`);
} catch (e) {
    console.log("aes-gcm decrypt of webcrypto ct: FAIL threw", e.message);
}
