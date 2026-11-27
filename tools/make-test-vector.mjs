// produces a vencord-format ciphertext (b64 of iv||ct||tag) using real WebCrypto,
// for cross-validating the pure-js implementation inside phoenix
const secret = "testkey-phoenix";
const plaintext = "hello phoenix e2e";

const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode("vencord-e2e"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
);
const iv = crypto.getRandomValues(new Uint8Array(12));
const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
const combined = new Uint8Array(12 + encrypted.byteLength);
combined.set(iv);
combined.set(new Uint8Array(encrypted), 12);
console.log(btoa(String.fromCharCode(...combined)));
