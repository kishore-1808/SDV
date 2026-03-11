const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditService = require('../services/AuditService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user.
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role, location } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    // Check existing user
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists.' });
    }

    // Create user
    const user = new User({
      username,
      email,
      password,
      role: role || 'guest',
      location: location || 'external'
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Audit log
    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'REGISTER',
      details: `New user registered with role: ${user.role}`,
      context: { location: user.location }
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        location: user.location
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return token.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Log failed login
      await AuditService.log({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: 'LOGIN_FAILED',
        details: 'Invalid password attempt',
        success: false
      });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Audit log
    await AuditService.log({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: 'LOGIN',
      details: 'User logged in successfully',
      context: { location: user.location }
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        location: user.location
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile.
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      location: req.user.location
    }
  });
});

module.exports = router;
