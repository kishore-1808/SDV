const express = require('express');
const AuditService = require('../services/AuditService');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/audit/logs
 * Get audit logs (Admin only).
 * Query params: action, limit, skip, startDate, endDate
 */
router.get('/logs', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { action, limit = 100, skip = 0, startDate, endDate } = req.query;

    const filters = {};
    if (action) filters.action = action;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const logs = await AuditService.getLogs(filters, parseInt(limit), parseInt(skip));

    await AuditService.log({
      userId: req.user._id,
      username: req.user.username,
      role: req.user.role,
      action: 'VIEW_AUDIT_LOGS',
      details: `Admin viewed audit logs (${logs.length} entries)`
    });

    res.json({ count: logs.length, logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs: ' + error.message });
  }
});

/**
 * GET /api/audit/my-logs
 * Get current user's audit logs.
 */
router.get('/my-logs', authenticate, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const filters = { userId: req.user._id };

    const logs = await AuditService.getLogs(filters, parseInt(limit), parseInt(skip));

    res.json({ count: logs.length, logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs: ' + error.message });
  }
});

/**
 * GET /api/audit/stats
 * Get audit statistics (Admin only).
 */
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const AuditLog = require('../models/AuditLog');

    const totalLogs = await AuditLog.countDocuments();
    const failedActions = await AuditLog.countDocuments({ success: false });
    const actionBreakdown = await AuditLog.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const recentActivity = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(10)
      .populate('user', 'username role');

    res.json({
      totalLogs,
      failedActions,
      successRate: totalLogs > 0 ? (((totalLogs - failedActions) / totalLogs) * 100).toFixed(2) + '%' : '0%',
      actionBreakdown,
      recentActivity
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats: ' + error.message });
  }
});

module.exports = router;
