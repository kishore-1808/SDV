const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const VaultItem = require('../models/VaultItem');
const EncryptionKey = require('../models/EncryptionKey');
const LoginHistory = require('../models/LoginHistory');
const Folder = require('../models/Folder');
const Version = require('../models/Version');
const Alert = require('../models/Alert');
const AuditService = require('../services/AuditService');
const EncryptionEngine = require('../services/EncryptionEngine');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

function getDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) return 'mobile';
  if (userAgent.includes('Tablet') || userAgent.includes('iPad')) return 'tablet';
  return 'desktop';
}

function ipMatches(userIp, whitelistEntry) {
  if (whitelistEntry.includes('/')) {
    const [baseIp, bits] = whitelistEntry.split('/');
    const baseNum = ipToNumber(baseIp);
    const mask = ~((1 << (32 - parseInt(bits))) - 1);
    return (ipToNumber(userIp) & mask) === (baseNum & mask);
  }
  return userIp === whitelistEntry;
}

function ipToNumber(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function isIpAllowed(userIp, whitelist) {
  if (!whitelist || whitelist.length === 0) return true;
  return whitelist.some(entry => ipMatches(userIp, entry));
}

// ========== Login History ==========

router.get('/login-history', authenticate, async (req, res) => {
  try {
    const history = await LoginHistory.find({ user: req.user._id })
      .sort({ loginTime: -1 })
      .limit(50);
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Theme & Settings ==========

router.put('/theme', authenticate, async (req, res) => {
  try {
    const { theme } = req.body;
    if (!['dark', 'light'].includes(theme)) {
      return res.status(400).json({ error: 'Theme must be dark or light.' });
    }
    await User.findByIdAndUpdate(req.user._id, { preferredTheme: theme });
    res.json({ message: 'Theme updated.', theme });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/settings', authenticate, async (req, res) => {
  try {
    const { inactivityTimeout } = req.body;
    const updates = {};
    if (inactivityTimeout !== undefined) updates.inactivityTimeout = Math.max(5, Math.min(120, parseInt(inactivityTimeout)));
    
    await User.findByIdAndUpdate(req.user._id, updates);
    res.json({ message: 'Settings updated.', updates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/settings', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('preferredTheme inactivityTimeout');
    res.json({
      preferredTheme: user.preferredTheme,
      inactivityTimeout: user.inactivityTimeout
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Folder Management ==========

router.post('/folders', authenticate, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Folder name required.' });
    
    const existing = await Folder.findOne({ owner: req.user._id, name });
    if (existing) return res.status(400).json({ error: 'Folder with this name already exists.' });

    const folder = new Folder({ owner: req.user._id, name, description, color: color || '#1a73e8' });
    await folder.save();

    await AuditService.log({
      userId: req.user._id, username: req.user.username, role: req.user.role,
      action: 'FOLDER_CREATED', details: `Folder "${name}" created`
    });

    res.status(201).json({ message: 'Folder created.', folder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/folders', authenticate, async (req, res) => {
  try {
    const folders = await Folder.find({ owner: req.user._id }).sort({ createdAt: 1 });
    const foldersWithCount = await Promise.all(folders.map(async (f) => {
      const count = await VaultItem.countDocuments({ owner: req.user._id, folder: f._id });
      return { ...f.toObject(), itemCount: count };
    }));
    res.json({ folders: foldersWithCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/folders/:id', authenticate, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const folder = await Folder.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { name, description, color },
      { new: true }
    );
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    res.json({ message: 'Folder updated.', folder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/folders/:id', authenticate, async (req, res) => {
  try {
    const folder = await Folder.findOne({ _id: req.params.id, owner: req.user._id });
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    if (folder.isDefault) return res.status(400).json({ error: 'Cannot delete the default folder.' });

    await VaultItem.updateMany({ owner: req.user._id, folder: folder._id }, { folder: null });
    await Folder.deleteOne({ _id: folder._id });

    await AuditService.log({
      userId: req.user._id, username: req.user.username, role: req.user.role,
      action: 'FOLDER_DELETED', details: `Folder "${folder.name}" deleted, items moved to root`
    });

    res.json({ message: 'Folder deleted. Items moved to root.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Search & Filter ==========

router.get('/vault/search', authenticate, async (req, res) => {
  try {
    const { q, sensitivity, folder, sort, order } = req.query;
    let query = {};

    if (req.user.role !== 'admin') {
      query.owner = req.user._id;
    }

    if (q) {
      query.title = { $regex: q, $options: 'i' };
    }
    if (sensitivity && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(sensitivity)) {
      query.sensitivityLevel = sensitivity;
    }
    if (folder === 'none') {
      query.folder = null;
    } else if (folder) {
      query.folder = folder;
    }

    const sortField = sort || 'createdAt';
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortObj = { [sortField]: sortOrder };

    const items = await VaultItem.find(query)
      .select('-encryptedData -iv -authTag')
      .populate('folder', 'name color')
      .populate('owner', 'username role')
      .sort(sortObj)
      .limit(100);

    res.json({ count: items.length, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Bulk Delete ==========

router.post('/vault/bulk-delete', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of item IDs required.' });
    }

    const query = { _id: { $in: ids } };
    if (req.user.role !== 'admin') {
      query.owner = req.user._id;
    }

    const items = await VaultItem.find(query);
    for (const item of items) {
      await EncryptionKey.deleteOne({ vaultItem: item._id });
    }
    const result = await VaultItem.deleteMany(query);

    await AuditService.log({
      userId: req.user._id, username: req.user.username, role: req.user.role,
      action: 'BULK_DELETE', details: `Bulk deleted ${result.deletedCount} vault items`,
      context: { deletedCount: result.deletedCount }
    });

    res.json({ message: `${result.deletedCount} items deleted.`, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Data Export ==========

router.get('/vault/export', authenticate, async (req, res) => {
  try {
    const items = await VaultItem.find({ owner: req.user._id })
      .populate('folder', 'name')
      .sort({ createdAt: -1 });

    const exportData = items.map(item => ({
      title: item.title,
      sensitivity: item.sensitivityLevel,
      encryption: item.encryptionStrategy,
      algorithm: item.algorithm,
      folder: item.folder?.name || 'Root',
      createdAt: item.createdAt,
      encryptedDataPreview: item.encryptedData.substring(0, 100) + '...'
    }));

    const token = jwt.sign(
      { data: exportData, userId: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await AuditService.log({
      userId: req.user._id, username: req.user.username, role: req.user.role,
      action: 'DATA_EXPORTED', details: `Exported ${items.length} vault items`
    });

    res.json({ message: 'Export ready.', count: items.length, exportToken: token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Version History ==========

router.get('/vault/:id/versions', authenticate, async (req, res) => {
  try {
    const item = await VaultItem.findOne({ _id: req.params.id, owner: req.user._id });
    if (!item) return res.status(404).json({ error: 'Vault item not found.' });

    const versions = await Version.find({ vaultItem: req.params.id }).sort({ versionNumber: -1 });
    res.json({ versions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/vault/:id/restore/:versionId', authenticate, async (req, res) => {
  try {
    const item = await VaultItem.findOne({ _id: req.params.id, owner: req.user._id });
    if (!item) return res.status(404).json({ error: 'Vault item not found.' });

    const version = await Version.findOne({ _id: req.params.versionId, vaultItem: req.params.id });
    if (!version) return res.status(404).json({ error: 'Version not found.' });

    const currentVersion = await Version.findOne({ vaultItem: req.params.id }).sort({ versionNumber: -1 });

    await Version.create({
      vaultItem: item._id,
      owner: req.user._id,
      versionNumber: (currentVersion?.versionNumber || 0) + 1,
      previousData: item.encryptedData,
      previousIv: item.iv,
      changeType: 'updated',
      note: `Restored from version ${version.versionNumber}`
    });

    const keyDoc = await EncryptionKey.findOne({ vaultItem: item._id });
    if (!keyDoc) return res.status(500).json({ error: 'Encryption key not found.' });

    const dataKeyHex = EncryptionEngine.unwrapKey(keyDoc.encryptedKey, keyDoc.keyIv, keyDoc.keyAuthTag, process.env.MASTER_ENCRYPTION_KEY);
    const newEncrypted = EncryptionEngine.encrypt(version.previousData, item.encryptionStrategy);

    item.encryptedData = newEncrypted.encryptedData;
    item.iv = newEncrypted.iv;
    item.authTag = newEncrypted.authTag;
    item.markModified('encryptedData');
    await item.save();

    await AuditService.log({
      userId: req.user._id, username: req.user.username, role: req.user.role,
      action: 'VERSION_RESTORED', details: `Restored version ${version.versionNumber} of "${item.title}"`,
      context: { vaultItemId: item._id, versionNumber: version.versionNumber }
    });

    res.json({ message: 'Version restored.', version: version.versionNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Admin: System Stats ==========

router.get('/admin/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [
      totalUsers, totalVaultItems, totalEncryptionKeys,
      totalAuditLogs, totalFolders, totalAlerts,
      encryptionBreakdown, sensitivityBreakdown
    ] = await Promise.all([
      User.countDocuments(),
      VaultItem.countDocuments(),
      EncryptionKey.countDocuments(),
      require('../models/AuditLog').countDocuments(),
      Folder.countDocuments(),
      Alert.countDocuments(),
      VaultItem.aggregate([{ $group: { _id: '$encryptionStrategy', count: { $sum: 1 } } }]),
      VaultItem.aggregate([{ $group: { _id: '$sensitivityLevel', count: { $sum: 1 } } }])
    ]);

    const recentActivity = await require('../models/AuditLog').find()
      .sort({ createdAt: -1 }).limit(10).populate('userId', 'username');

    res.json({
      totalUsers,
      totalVaultItems,
      totalEncryptionKeys,
      totalAuditLogs,
      totalFolders,
      totalAlerts,
      encryptionBreakdown,
      sensitivityBreakdown,
      recentActivity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Admin: Bulk User Management ==========

router.post('/admin/users/bulk', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { users } = req.body;
    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ error: 'Array of users required.' });
    }

    const results = { created: 0, failed: 0, errors: [] };

    for (const u of users) {
      try {
        const existing = await User.findOne({ $or: [{ email: u.email }, { username: u.username }] });
        if (existing) {
          results.failed++;
          results.errors.push(`Email/username already exists: ${u.email || u.username}`);
          continue;
        }
        const user = new User({
          username: u.username,
          email: u.email,
          password: u.password || 'changeme123',
          role: u.role || 'student',
          location: u.location || 'external'
        });
        await user.save();
        results.created++;
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
      }
    }

    await AuditService.log({
      userId: req.user._id, username: req.user.username, role: req.user.role,
      action: 'BULK_USER_CREATE', details: `Bulk created ${results.created} users, ${results.failed} failed`
    });

    res.json({ message: 'Bulk user creation complete.', results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/users/bulk-delete', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'Array of user IDs required.' });
    }

    const admins = await User.find({ _id: { $in: ids }, role: 'admin' });
    if (admins.length > 0) {
      return res.status(400).json({ error: 'Cannot delete admin users.' });
    }

    for (const id of ids) {
      const vaultItems = await VaultItem.find({ owner: id });
      for (const item of vaultItems) {
        await EncryptionKey.deleteOne({ vaultItem: item._id });
      }
      await VaultItem.deleteMany({ owner: id });
      await LoginHistory.deleteMany({ user: id });
      await Folder.deleteMany({ owner: id });
      await Alert.deleteMany({ user: id });
    }

    const result = await User.deleteMany({ _id: { $in: ids }, role: { $ne: 'admin' } });

    await AuditService.log({
      userId: req.user._id, username: req.user.username, role: req.user.role,
      action: 'BULK_USER_DELETE', details: `Bulk deleted ${result.deletedCount} users`
    });

    res.json({ message: `${result.deletedCount} users deleted.`, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Alerts ==========

router.get('/alerts', authenticate, async (req, res) => {
  try {
    const alerts = await Alert.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    const unreadCount = await Alert.countDocuments({ user: req.user._id, isRead: false });
    res.json({ alerts, unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/alerts/:id/read', authenticate, async (req, res) => {
  try {
    await Alert.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { isRead: true, readAt: new Date() });
    res.json({ message: 'Alert marked as read.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/alerts/read-all', authenticate, async (req, res) => {
  try {
    await Alert.updateMany({ user: req.user._id, isRead: false }, { isRead: true, readAt: new Date() });
    res.json({ message: 'All alerts marked as read.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
