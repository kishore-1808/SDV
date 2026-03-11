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

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 15000,
}).then(() => console.log('MongoDB Connected')).catch(err => console.error('MongoDB Error:', err.message));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/vault', require('./routes/vaultRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'Secure Data Vault API is running', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
