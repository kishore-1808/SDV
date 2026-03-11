/**
 * Encryption Engine - Context-Aware Encryption with 3 Strategy Tiers.
 * 
 * Strategies:
 *   BASIC    -> AES-128-CBC  (for low-risk contexts)
 *   STANDARD -> AES-192-CBC  (for medium-risk contexts)
 *   STRONG   -> AES-256-GCM  (for high-risk contexts, authenticated encryption)
 * 
 * Keys are encrypted separately using the master key (key wrapping).
 */

const crypto = require('crypto');

class EncryptionEngine {
  /**
   * Get algorithm config based on strategy.
   */
  static getAlgorithmConfig(strategy) {
    switch (strategy) {
      case 'BASIC':
        return { algorithm: 'aes-128-cbc', keyLength: 16, ivLength: 16, useAuthTag: false };
      case 'STANDARD':
        return { algorithm: 'aes-192-cbc', keyLength: 24, ivLength: 16, useAuthTag: false };
      case 'STRONG':
        return { algorithm: 'aes-256-gcm', keyLength: 32, ivLength: 16, useAuthTag: true };
      default:
        return { algorithm: 'aes-192-cbc', keyLength: 24, ivLength: 16, useAuthTag: false };
    }
  }

  /**
   * Encrypt data using the specified strategy.
   * @param {string} plaintext - Data to encrypt
   * @param {string} strategy - BASIC, STANDARD, or STRONG
   * @returns {Object} - { encryptedData, iv, authTag, dataKey, algorithm, strategy }
   */
  static encrypt(plaintext, strategy) {
    const config = this.getAlgorithmConfig(strategy);

    // Generate a random data encryption key
    const dataKey = crypto.randomBytes(config.keyLength);
    const iv = crypto.randomBytes(config.ivLength);

    const cipher = crypto.createCipheriv(config.algorithm, dataKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const result = {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: config.useAuthTag ? cipher.getAuthTag().toString('hex') : null,
      dataKey: dataKey.toString('hex'),
      algorithm: config.algorithm,
      strategy
    };

    return result;
  }

  /**
   * Decrypt data using the specified strategy and key.
   * @param {string} encryptedData - Hex-encoded encrypted data
   * @param {string} dataKeyHex - Hex-encoded data encryption key
   * @param {string} ivHex - Hex-encoded initialization vector
   * @param {string} strategy - BASIC, STANDARD, or STRONG
   * @param {string|null} authTagHex - Hex-encoded auth tag (for GCM mode)
   * @returns {string} - Decrypted plaintext
   */
  static decrypt(encryptedData, dataKeyHex, ivHex, strategy, authTagHex = null) {
    const config = this.getAlgorithmConfig(strategy);
    const dataKey = Buffer.from(dataKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');

    const decipher = crypto.createDecipheriv(config.algorithm, dataKey, iv);

    if (config.useAuthTag && authTagHex) {
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    }

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Wrap (encrypt) a data key using the master key.
   * Keys are stored separately from encrypted data for enhanced security.
   */
  static wrapKey(dataKeyHex, masterKeyHex) {
    const masterKey = Buffer.from(masterKeyHex, 'hex').slice(0, 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    let wrapped = cipher.update(dataKeyHex, 'utf8', 'hex');
    wrapped += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encryptedKey: wrapped,
      keyIv: iv.toString('hex'),
      keyAuthTag: authTag
    };
  }

  /**
   * Unwrap (decrypt) a data key using the master key.
   */
  static unwrapKey(encryptedKeyHex, keyIvHex, keyAuthTagHex, masterKeyHex) {
    const masterKey = Buffer.from(masterKeyHex, 'hex').slice(0, 32);
    const iv = Buffer.from(keyIvHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(Buffer.from(keyAuthTagHex, 'hex'));

    let unwrapped = decipher.update(encryptedKeyHex, 'hex', 'utf8');
    unwrapped += decipher.final('utf8');

    return unwrapped;
  }
}

module.exports = EncryptionEngine;
