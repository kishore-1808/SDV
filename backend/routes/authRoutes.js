const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const LoginHistory = require('../models/LoginHistory');
const Alert = require('../models/Alert');
const AuditService = require('../services/AuditService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

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

function getDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) return 'mobile';
  if (userAgent.includes('Tablet') || userAgent.includes('iPad')) return 'tablet';
  return 'desktop';
}

async function checkSuspiciousLogin(user, ip, userAgent) {
  const recentLogins = await LoginHistory.find({
    user: user._id,
    loginTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  }).sort({ loginTime: -1 }).limit(5);

  const knownIps = [...new Set(recentLogins.map(l => l.ipAddress).filter(ip => ip !== 'unknown'))];
  const isNewIp = !knownIps.includes(ip);

  if (isNewIp && knownIps.length > 0) {
    const alert = new Alert({
      user: user._id,
      type: 'suspicious_login',
      title: 'New IP Login Detected',
      message: `Login from new IP address (${ip}). If this wasn't you, secure your account.`,
      severity: 'medium',
      ipAddress: ip
    });
    await alert.save();
  }
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role, location } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists.' });
    }

    const user = new User({
      username, email, password,
      role: role || 'student',
      location: location || 'external'
    });
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

    const defaultFolder = new (require('../models/Folder'))({
      owner: user._id, name: 'General', description: 'Default folder', color: '#1a73e8', isDefault: true
    });
    await defaultFolder.save();

    await AuditService.log({
      userId: user._id, username: user.username, role: user.role,
      action: 'REGISTER', details: `New user registered with role: ${user.role}`,
      context: { location: user.location }
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role, location: user.location }
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      const remaining = Math.ceil((user.lockUntil - new Date()) / 1000 / 60);
      return res.status(423).json({ error: `Account locked. Try again in ${remaining} minutes.`, lockUntil: user.lockUntil });
    }

    if (!isIpAllowed(clientIp, user.ipWhitelist)) {
      await AuditService.log({
        userId: user._id, username: user.username, role: user.role,
        action: 'LOGIN_BLOCKED_IP', details: `Login blocked - IP not whitelisted. IP: ${clientIp}`,
        success: false, context: { ip: clientIp }
      });
      return res.status(403).json({ error: `Login blocked: Your IP address (${clientIp}) is not in the allowed list. Contact admin.` });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        user.loginAttempts = 0;
        await user.save();

        const alert = new Alert({ user: user._id, type: 'account_locked', title: 'Account Locked', message: `Account locked after ${MAX_LOGIN_ATTEMPTS} failed attempts from IP: ${clientIp}`, severity: 'high', ipAddress: clientIp });
        await alert.save();

        await AuditService.log({
          userId: user._id, username: user.username, role: user.role,
          action: 'ACCOUNT_LOCKED', details: `Account locked after ${MAX_LOGIN_ATTEMPTS} failed attempts from IP: ${clientIp}`,
          success: false, context: { ip: clientIp }
        });
        return res.status(423).json({ error: `Account locked. Too many failed attempts. Try again in 15 minutes.`, lockUntil: user.lockUntil });
      }
      await user.save();

      await AuditService.log({
        userId: user._id, username: user.username, role: user.role,
        action: 'LOGIN_FAILED', details: `Invalid password (${user.loginAttempts}/${MAX_LOGIN_ATTEMPTS}) from IP: ${clientIp}`,
        success: false, context: { ip: clientIp }
      });
      return res.status(401).json({ error: 'Invalid credentials.', attemptsRemaining: MAX_LOGIN_ATTEMPTS - user.loginAttempts });
    }

    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    await checkSuspiciousLogin(user, clientIp, userAgent);

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

    const loginHistory = new LoginHistory({
      user: user._id,
      ipAddress: clientIp,
      userAgent,
      deviceType: getDeviceType(userAgent),
      loginTime: new Date(),
      status: 'success'
    });
    await loginHistory.save();

    await AuditService.log({
      userId: user._id, username: user.username, role: user.role,
      action: 'LOGIN', details: `Login successful from IP: ${clientIp}`, context: { ip: clientIp, device: getDeviceType(userAgent) }
    });

    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role, location: user.location }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      location: req.user.location,
      preferredTheme: req.user.preferredTheme
    }
  });
});

module.exports = router;
