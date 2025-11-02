const express = require('express');
const cors = require('cors');
const config = require('./config');
const { initializeDatabase } = require('./db');
const { 
  fetchAllQuotes, 
  calculateAverages, 
  calculateSlippage 
} = require('./services/quoteService');

const app = express();

// Middleware
app.use(cors({
  origin: config.CORS_ORIGIN
}));
app.use(express.json());

// Cache control middleware
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV
  });
});

// Get quotes from all sources
app.get('/quotes', async (req, res) => {
  try {
    const quotes = await fetchAllQuotes();
    res.json(quotes);
  } catch (error) {
    console.error('Error in /quotes:', error);
    res.status(500).json({ 
      error: 'Failed to fetch quotes',
      details: config.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get average prices
app.get('/average', async (req, res) => {
  try {
    const quotes = await fetchAllQuotes();
    const averages = calculateAverages(quotes);
    res.json(averages);
  } catch (error) {
    console.error('Error in /average:', error);
    res.status(500).json({ 
      error: 'Failed to calculate averages',
      details: config.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get slippage information
app.get('/slippage', async (req, res) => {
  try {
    const quotes = await fetchAllQuotes();
    const averages = calculateAverages(quotes);
    const slippage = calculateSlippage(quotes, averages);
    res.json(slippage);
  } catch (error) {
    console.error('Error in /slippage:', error);
    res.status(500).json({ 
      error: 'Failed to calculate slippage',
      details: config.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    details: config.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const server = app.listen(config.PORT, () => {
  console.log(`Server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
  
  // Initial fetch of quotes
  fetchAllQuotes().catch(console.error);
  
  // Refresh quotes every 30 seconds to ensure data is never older than 60s
  setInterval(() => {
    fetchAllQuotes().catch(console.error);
  }, 30000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('Database initialized');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();
