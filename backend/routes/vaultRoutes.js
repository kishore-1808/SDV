const express = require('express');
const VaultItem = require('../models/VaultItem');
const EncryptionKey = require('../models/EncryptionKey');
const EncryptionEngine = require('../services/EncryptionEngine');
const PolicyEngine = require('../services/PolicyEngine');
const AuditService = require('../services/AuditService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/vault/store
 * Store data securely with context-aware encryption.
 */
router.post('/store', authenticate, async (req, res) => {
  try {
    const { title, data, sensitivityLevel } = req.body;
    const user = req.user;

    if (!title || !data || !sensitivityLevel) {
      return res.status(400).json({ error: 'Title, data, and sensitivityLevel are required.' });
    }

    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(sensitivityLevel)) {
      return res.status(400).json({ error: 'sensitivityLevel must be LOW, MEDIUM, HIGH, or CRITICAL.' });
    }

    // Step 1: Check access based on role
    const accessCheck = PolicyEngine.checkAccess(user.role, sensitivityLevel);
    if (!accessCheck.granted) {
      await AuditService.log({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: 'ACCESS_DENIED',
        resource: title,
        details: accessCheck.message,
        context: { sensitivityLevel, location: user.location },
        success: false
      });
      return res.status(403).json({ error: accessCheck.message });
    }

    // Step 2: Evaluate context to determine encryption strategy
    const context = {
      role: user.role,
      sensitivityLevel,
      location: user.location,
      timestamp: new Date().toISOString()
    };
    const policyResult = PolicyEngine.evaluate(context);

    // Log policy evaluation
    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'POLICY_EVALUATED',
      resource: title,
      details: `Policy score: ${policyResult.score}, Strategy: ${policyResult.strategy}`,
      context: {
        sensitivityLevel,
        location: user.location,
        encryptionStrategy: policyResult.strategy
      }
    });

    // Step 3: Encrypt the data
    const encryptionResult = EncryptionEngine.encrypt(data, policyResult.strategy);

    // Step 4: Wrap (encrypt) the data key with master key
    const wrappedKey = EncryptionEngine.wrapKey(
      encryptionResult.dataKey,
      process.env.MASTER_ENCRYPTION_KEY
    );

    // Step 5: Store encrypted data in vault
    const vaultItem = new VaultItem({
      owner: user._id,
      title,
      sensitivityLevel,
      encryptedData: encryptionResult.encryptedData,
      iv: encryptionResult.iv,
      authTag: encryptionResult.authTag,
      encryptionStrategy: policyResult.strategy,
      algorithm: encryptionResult.algorithm,
      metadata: {
        originalSize: Buffer.byteLength(data, 'utf8'),
        encryptedAt: new Date(),
        contextSnapshot: {
          role: user.role,
          location: user.location,
          timeOfAccess: context.timestamp,
          sensitivityLevel,
          policyDecision: `${policyResult.strategy} (score: ${policyResult.score})`
        }
      }
    });
    await vaultItem.save();

    // Step 6: Store encryption key separately
    const encryptionKeyDoc = new EncryptionKey({
      vaultItem: vaultItem._id,
      owner: user._id,
      encryptedKey: wrappedKey.encryptedKey,
      keyIv: wrappedKey.keyIv,
      keyAuthTag: wrappedKey.keyAuthTag,
      algorithm: encryptionResult.algorithm
    });
    await encryptionKeyDoc.save();

    // Log storage
    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'STORE_DATA',
      resource: title,
      details: `Data stored with ${policyResult.strategy} encryption (${encryptionResult.algorithm})`,
      context: {
        sensitivityLevel,
        location: user.location,
        encryptionStrategy: policyResult.strategy
      }
    });

    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'ENCRYPTION_APPLIED',
      resource: title,
      details: `${encryptionResult.algorithm} applied. Key wrapped and stored separately.`,
      context: { encryptionStrategy: policyResult.strategy }
    });

    res.status(201).json({
      message: 'Data stored securely',
      vaultItem: {
        id: vaultItem._id,
        title: vaultItem.title,
        sensitivityLevel: vaultItem.sensitivityLevel,
        encryptionStrategy: policyResult.strategy,
        algorithm: encryptionResult.algorithm,
        policyEvaluation: {
          score: policyResult.score,
          reasons: policyResult.reasons
        },
        storedAt: vaultItem.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to store data: ' + error.message });
  }
});

/**
 * GET /api/vault/retrieve/:id
 * Retrieve and decrypt data from the vault.
 */
router.get('/retrieve/:id', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const vaultItem = await VaultItem.findById(req.params.id);

    if (!vaultItem) {
      return res.status(404).json({ error: 'Vault item not found.' });
    }

    // Check ownership (admin can access all)
    if (vaultItem.owner.toString() !== user._id.toString() && user.role !== 'admin') {
      await AuditService.log({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: 'ACCESS_DENIED',
        resource: vaultItem.title,
        details: 'Attempted to access another user\'s data',
        success: false
      });
      return res.status(403).json({ error: 'Access denied. You can only access your own data.' });
    }

    // Re-evaluate context for retrieval
    const accessCheck = PolicyEngine.checkAccess(user.role, vaultItem.sensitivityLevel);
    if (!accessCheck.granted) {
      await AuditService.log({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: 'ACCESS_DENIED',
        resource: vaultItem.title,
        details: accessCheck.message,
        context: { sensitivityLevel: vaultItem.sensitivityLevel },
        success: false
      });
      return res.status(403).json({ error: accessCheck.message });
    }

    // Get the encryption key
    const keyDoc = await EncryptionKey.findOne({ vaultItem: vaultItem._id });
    if (!keyDoc) {
      return res.status(500).json({ error: 'Encryption key not found. Data cannot be decrypted.' });
    }

    // Unwrap the data key
    const dataKeyHex = EncryptionEngine.unwrapKey(
      keyDoc.encryptedKey,
      keyDoc.keyIv,
      keyDoc.keyAuthTag,
      process.env.MASTER_ENCRYPTION_KEY
    );

    // Decrypt the data
    const decryptedData = EncryptionEngine.decrypt(
      vaultItem.encryptedData,
      dataKeyHex,
      vaultItem.iv,
      vaultItem.encryptionStrategy,
      vaultItem.authTag
    );

    // Audit logs
    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'RETRIEVE_DATA',
      resource: vaultItem.title,
      details: `Data retrieved and decrypted (${vaultItem.encryptionStrategy})`,
      context: {
        sensitivityLevel: vaultItem.sensitivityLevel,
        location: user.location,
        encryptionStrategy: vaultItem.encryptionStrategy
      }
    });

    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'DECRYPTION_APPLIED',
      resource: vaultItem.title,
      details: `${vaultItem.algorithm} decryption applied`,
      context: { encryptionStrategy: vaultItem.encryptionStrategy }
    });

    res.json({
      message: 'Data retrieved and decrypted successfully',
      vaultItem: {
        id: vaultItem._id,
        title: vaultItem.title,
        sensitivityLevel: vaultItem.sensitivityLevel,
        encryptionStrategy: vaultItem.encryptionStrategy,
        algorithm: vaultItem.algorithm,
        data: decryptedData,
        metadata: vaultItem.metadata,
        storedAt: vaultItem.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve data: ' + error.message });
  }
});

/**
 * GET /api/vault/items
 * List all vault items for the current user (without decrypted data).
 */
router.get('/items', authenticate, async (req, res) => {
  try {
    const user = req.user;
    let query = {};

    // Admin can see all items, others see only their own
    if (user.role !== 'admin') {
      query.owner = user._id;
    }

    const items = await VaultItem.find(query)
      .select('-encryptedData -iv -authTag')
      .populate('owner', 'username role')
      .sort({ createdAt: -1 });

    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'RETRIEVE_ALL',
      details: `Listed ${items.length} vault items`,
      context: { location: user.location }
    });

    res.json({ count: items.length, items });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list items: ' + error.message });
  }
});

/**
 * DELETE /api/vault/delete/:id
 * Delete a vault item (admin or owner only).
 */
router.delete('/delete/:id', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const vaultItem = await VaultItem.findById(req.params.id);

    if (!vaultItem) {
      return res.status(404).json({ error: 'Vault item not found.' });
    }

    if (vaultItem.owner.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only the owner or admin can delete.' });
    }

    // Delete the encryption key first
    await EncryptionKey.deleteOne({ vaultItem: vaultItem._id });
    await VaultItem.findByIdAndDelete(req.params.id);

    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'DELETE_DATA',
      resource: vaultItem.title,
      details: `Vault item and associated encryption key deleted`,
      context: { sensitivityLevel: vaultItem.sensitivityLevel }
    });

    res.json({ message: 'Vault item deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete: ' + error.message });
  }
});

module.exports = router;
