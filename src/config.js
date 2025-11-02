const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  // Force refresh every 60 seconds
  QUOTE_TTL_SECONDS: 60,
  DATABASE_PATH: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'quotes.db'),
  REQUEST_TIMEOUT_MS: 10000, // 10 seconds timeout
  // Sources configuration
  ARS_SOURCES: ['ambito', 'dolarhoy'],
  BRL_SOURCES: ['wise', 'nubank'],
  // Deployment configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Add CORS configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
};
