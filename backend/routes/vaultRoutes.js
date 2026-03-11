const express = require('express');
const multer = require('multer');
const VaultItem = require('../models/VaultItem');
const EncryptionKey = require('../models/EncryptionKey');
const EncryptionEngine = require('../services/EncryptionEngine');
const PolicyEngine = require('../services/PolicyEngine');
const AuditService = require('../services/AuditService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

/**
 * POST /api/vault/store
 * Store text data securely with context-aware encryption.
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

    const context = {
      role: user.role,
      sensitivityLevel,
      location: user.location,
      timestamp: new Date().toISOString()
    };
    const policyResult = PolicyEngine.evaluate(context);

    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'POLICY_EVALUATED',
      resource: title,
      details: `Policy score: ${policyResult.score}, Strategy: ${policyResult.strategy}`,
      context: { sensitivityLevel, location: user.location, encryptionStrategy: policyResult.strategy }
    });

    const encryptionResult = EncryptionEngine.encrypt(data, policyResult.strategy);
    const wrappedKey = EncryptionEngine.wrapKey(encryptionResult.dataKey, process.env.MASTER_ENCRYPTION_KEY);

    const vaultItem = new VaultItem({
      owner: user._id,
      title,
      sensitivityLevel,
      fileType: 'text',
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

    const encryptionKeyDoc = new EncryptionKey({
      vaultItem: vaultItem._id,
      owner: user._id,
      encryptedKey: wrappedKey.encryptedKey,
      keyIv: wrappedKey.keyIv,
      keyAuthTag: wrappedKey.keyAuthTag,
      algorithm: encryptionResult.algorithm
    });
    await encryptionKeyDoc.save();

    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'STORE_DATA',
      resource: title,
      details: `Text data stored with ${policyResult.strategy} encryption`,
      context: { sensitivityLevel, encryptionStrategy: policyResult.strategy }
    });

    res.status(201).json({
      message: 'Data stored securely',
      vaultItem: {
        id: vaultItem._id,
        title: vaultItem.title,
        sensitivityLevel: vaultItem.sensitivityLevel,
        fileType: 'text',
        encryptionStrategy: policyResult.strategy,
        algorithm: encryptionResult.algorithm,
        policyEvaluation: { score: policyResult.score, reasons: policyResult.reasons },
        storedAt: vaultItem.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to store data: ' + error.message });
  }
});

/**
 * POST /api/vault/store/pdf
 * Store PDF file securely with context-aware encryption.
 */
router.post('/store/pdf', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { title, sensitivityLevel } = req.body;
    const user = req.user;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'PDF file is required.' });
    }

    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed.' });
    }

    if (!title || !sensitivityLevel) {
      return res.status(400).json({ error: 'Title and sensitivityLevel are required.' });
    }

    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(sensitivityLevel)) {
      return res.status(400).json({ error: 'sensitivityLevel must be LOW, MEDIUM, HIGH, or CRITICAL.' });
    }

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

    const context = {
      role: user.role,
      sensitivityLevel,
      location: user.location,
      timestamp: new Date().toISOString()
    };
    const policyResult = PolicyEngine.evaluate(context);

    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'POLICY_EVALUATED',
      resource: title,
      details: `PDF Policy score: ${policyResult.score}, Strategy: ${policyResult.strategy}`,
      context: { sensitivityLevel, location: user.location, encryptionStrategy: policyResult.strategy }
    });

    const fileBuffer = file.buffer.toString('base64');
    const encryptionResult = EncryptionEngine.encrypt(fileBuffer, policyResult.strategy);
    const wrappedKey = EncryptionEngine.wrapKey(encryptionResult.dataKey, process.env.MASTER_ENCRYPTION_KEY);

    const vaultItem = new VaultItem({
      owner: user._id,
      title,
      sensitivityLevel,
      fileType: 'pdf',
      originalFileName: file.originalname,
      encryptedData: encryptionResult.encryptedData,
      iv: encryptionResult.iv,
      authTag: encryptionResult.authTag,
      encryptionStrategy: policyResult.strategy,
      algorithm: encryptionResult.algorithm,
      metadata: {
        originalSize: file.size,
        mimeType: file.mimetype,
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

    const encryptionKeyDoc = new EncryptionKey({
      vaultItem: vaultItem._id,
      owner: user._id,
      encryptedKey: wrappedKey.encryptedKey,
      keyIv: wrappedKey.keyIv,
      keyAuthTag: wrappedKey.keyAuthTag,
      algorithm: encryptionResult.algorithm
    });
    await encryptionKeyDoc.save();

    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'STORE_DATA',
      resource: title,
      details: `PDF file stored with ${policyResult.strategy} encryption`,
      context: { sensitivityLevel, encryptionStrategy: policyResult.strategy }
    });

    res.status(201).json({
      message: 'PDF file stored securely',
      vaultItem: {
        id: vaultItem._id,
        title: vaultItem.title,
        originalFileName: vaultItem.originalFileName,
        sensitivityLevel: vaultItem.sensitivityLevel,
        fileType: 'pdf',
        encryptionStrategy: policyResult.strategy,
        algorithm: encryptionResult.algorithm,
        policyEvaluation: { score: policyResult.score, reasons: policyResult.reasons },
        storedAt: vaultItem.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to store PDF: ' + error.message });
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

    const keyDoc = await EncryptionKey.findOne({ vaultItem: vaultItem._id });
    if (!keyDoc) {
      return res.status(500).json({ error: 'Encryption key not found. Data cannot be decrypted.' });
    }

    const dataKeyHex = EncryptionEngine.unwrapKey(
      keyDoc.encryptedKey,
      keyDoc.keyIv,
      keyDoc.keyAuthTag,
      process.env.MASTER_ENCRYPTION_KEY
    );

    const decryptedData = EncryptionEngine.decrypt(
      vaultItem.encryptedData,
      dataKeyHex,
      vaultItem.iv,
      vaultItem.encryptionStrategy,
      vaultItem.authTag
    );

    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'RETRIEVE_DATA',
      resource: vaultItem.title,
      details: `${vaultItem.fileType === 'pdf' ? 'PDF file' : 'Data'} retrieved and decrypted`,
      context: { sensitivityLevel: vaultItem.sensitivityLevel, encryptionStrategy: vaultItem.encryptionStrategy }
    });

    if (vaultItem.fileType === 'pdf') {
      const pdfBuffer = Buffer.from(decryptedData, 'base64');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${vaultItem.originalFileName}"`);
      return res.send(pdfBuffer);
    }

    res.json({
      message: 'Data retrieved and decrypted successfully',
      vaultItem: {
        id: vaultItem._id,
        title: vaultItem.title,
        sensitivityLevel: vaultItem.sensitivityLevel,
        fileType: vaultItem.fileType,
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
 * List all vault items for the current user.
 */
router.get('/items', authenticate, async (req, res) => {
  try {
    const user = req.user;
    let query = {};

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
 * Delete a vault item.
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
