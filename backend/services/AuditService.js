const AuditLog = require('../models/AuditLog');

/**
 * Audit Service - Logs all system activities for traceability and compliance.
 */
class AuditService {
  /**
   * Log an action to the audit trail.
   * @param {Object} params
   */
  static async log({ userId, username, role, action, resource, details, context, success = true }) {
    try {
      const logEntry = new AuditLog({
        user: userId,
        username,
        role,
        action,
        resource: resource || null,
        details: details || null,
        context: context || {},
        success,
        timestamp: new Date()
      });
      await logEntry.save();
      return logEntry;
    } catch (error) {
      console.error('Audit logging error:', error.message);
      // Audit logging should not break the main operation
    }
  }

  /**
   * Get audit logs with optional filters.
   */
  static async getLogs(filters = {}, limit = 100, skip = 0) {
    const query = {};
    if (filters.userId) query.user = filters.userId;
    if (filters.action) query.action = filters.action;
    if (filters.success !== undefined) query.success = filters.success;
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
      if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
    }

    return AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .populate('user', 'username role');
  }
}

module.exports = AuditService;
