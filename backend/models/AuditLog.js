const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true
  },
  action: {
    type: String,
    enum: [
      'LOGIN', 'LOGIN_FAILED', 'REGISTER',
      'STORE_DATA', 'RETRIEVE_DATA', 'RETRIEVE_ALL',
      'DELETE_DATA', 'ACCESS_DENIED',
      'ENCRYPTION_APPLIED', 'DECRYPTION_APPLIED',
      'POLICY_EVALUATED', 'VIEW_AUDIT_LOGS'
    ],
    required: true
  },
  resource: {
    type: String,
    default: null
  },
  details: {
    type: String,
    default: null
  },
  context: {
    location: String,
    timeOfAccess: String,
    sensitivityLevel: String,
    encryptionStrategy: String,
    ipAddress: String
  },
  success: {
    type: Boolean,
    default: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
