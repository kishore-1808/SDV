const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const app = express();

app.use(cors({ 
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// MongoDB connection - optimized for serverless
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('MongoDB Atlas Connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
  }
};

// Middleware to ensure DB connection before routes
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/vault', require('./routes/vaultRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'Secure Data Vault API is running', timestamp: new Date().toISOString() });
});

// For local development
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Secure Data Vault server running on port ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
