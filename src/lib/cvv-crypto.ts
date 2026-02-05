/**
 * CVV-specific encryption using PIN-derived key
 * 
 * CVV is encrypted with a key derived from the master PIN.
 * This means:
 * - CVV is stored encrypted
 * - Without the PIN, CVV cannot be decrypted
 * - Even with system access, attacker needs the PIN
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { getCvvEncryptionKey } from "./pin-manager";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

const CVV_PREFIX = "cvv:";

/**
 * Check if value is CVV-encrypted
 */
export function isCvvEncrypted(value: string): boolean {
  return value?.startsWith(CVV_PREFIX) || false;
}

/**
 * Encrypt CVV with PIN-derived key
 * Requires cards to be unlocked
 */
export function encryptCvv(cvv: string): string | null {
  const key = getCvvEncryptionKey();
  if (!key) {
    return null; // Not unlocked
  }
  
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(cvv, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  
  // Format: cvv:<iv>:<authTag>:<ciphertext>
  return `${CVV_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt CVV with PIN-derived key
 * Requires cards to be unlocked
 */
export function decryptCvv(encrypted: string): string | null {
  if (!isCvvEncrypted(encrypted)) {
    return encrypted; // Not encrypted, return as-is
  }
  
  const key = getCvvEncryptionKey();
  if (!key) {
    return null; // Not unlocked
  }
  
  const parts = encrypted.slice(CVV_PREFIX.length).split(":");
  if (parts.length !== 3) {
    return null; // Invalid format
  }
  
  try {
    const iv = Buffer.from(parts[0]!, "base64");
    const authTag = Buffer.from(parts[1]!, "base64");
    const ciphertext = parts[2]!;
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch {
    return null; // Decryption failed (wrong PIN or corrupted)
  }
}
