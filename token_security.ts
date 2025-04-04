// Basic encryption/decryption using a key file
// Note: This is basic security and not suitable for high-security applications
// For production, consider using a dedicated secret management service

import { encodeBase64 as encode, decodeBase64 as decode } from "https://deno.land/std@0.220.1/encoding/base64.ts";

// Secret key for encryption (in production, store this securely - not in code)
const SECRET_KEY_FILE = './data/.secret_key';

// Generate a random key if it doesn't exist
async function ensureSecretKey(): Promise<Uint8Array> {
  try {
    return await Deno.readFile(SECRET_KEY_FILE);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log('Generating new secret key...');
      const key = new Uint8Array(32);
      crypto.getRandomValues(key);
      await Deno.writeFile(SECRET_KEY_FILE, key);
      return key;
    }
    throw error;
  }
}

// Encrypt a string using the secret key
export async function encryptConfig(data: string): Promise<string> {
  const key = await ensureSecretKey();
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);

  // In a real application, use a proper encryption algorithm
  // This is a simple XOR operation for demonstration
  const encrypted = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encrypted[i] = dataBytes[i] ^ key[i % key.length];
  }

  return encode(encrypted);
}

// Decrypt a string using the secret key
export async function decryptConfig(encryptedBase64: string): Promise<string> {
  const key = await ensureSecretKey();
  const encrypted = decode(encryptedBase64);

  // Reverse the XOR operation
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ key[i % key.length];
  }

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Save config securely
export async function saveConfigSecurely(config: object): Promise<void> {
  const configJson = JSON.stringify(config, null, 2);
  const encrypted = await encryptConfig(configJson);
  await Deno.writeTextFile('./data/config.encrypted', encrypted);
}

// Load config securely
export async function loadConfigSecurely(): Promise<object> {
  try {
    const encrypted = await Deno.readTextFile('./data/config.encrypted');
    const decrypted = await decryptConfig(encrypted);
    return JSON.parse(decrypted);
  } catch (error) {
    // If encrypted config doesn't exist, try loading the plain one
    if (error instanceof Deno.errors.NotFound) {
      console.warn('Encrypted config not found, trying plain config...');
      const plainConfig = await Deno.readTextFile('./data/config.json');

      // Automatically migrate to encrypted storage
      const config = JSON.parse(plainConfig);
      await saveConfigSecurely(config);
      console.log('Migrated to encrypted config storage');

      // Optionally remove the plaintext file
      // await Deno.remove('./data/config.json');

      return config;
    }
    throw error;
  }
}