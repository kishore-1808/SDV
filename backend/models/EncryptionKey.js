const mongoose = require('mongoose');

const encryptionKeySchema = new mongoose.Schema({
  vaultItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VaultItem',
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  encryptedKey: {
    type: String,
    required: true
  },
  keyIv: {
    type: String,
    required: true
  },
  keyAuthTag: {
    type: String,
    required: true
  },
  algorithm: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('EncryptionKey', encryptionKeySchema);
