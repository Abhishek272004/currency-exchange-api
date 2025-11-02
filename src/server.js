const express = require('express');
const cors = require('cors');
const config = require('./config');
const { getDb } = require('./db');
const statusTracker = require('./utils/statusTracker');
const { 
  fetchAllQuotes, 
  calculateAverages, 
  calculateSlippage 
} = require('./services/quoteService');

const app = express();

// Middleware
app.use(cors({
  origin: config.CORS_ORIGIN || '*'
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// Cache control middleware
app.use((req, res, next) => {
  // Don't cache API responses by default
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const dbStatus = getDb() ? 'connected' : 'disconnected';
  
  res.json({ 
    status: 'ok',
    db: dbStatus,
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    version: require('../package.json').version
  });
});

// Status endpoint
app.get('/status', async (req, res) => {
  try {
    const status = statusTracker.getStatus();
    const sources = Object.keys(status);
    const healthySources = sources.filter(source => status[source].success);
    
    res.json({
      status: 'ok',
      sources: {
        total: sources.length,
        healthy: healthySources.length,
        unhealthy: sources.length - healthySources.length,
        details: status
      },
      uptime: process.uptime().toFixed(2) + 's',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get system status',
      error: config.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get quotes from all sources
app.get('/quotes', async (req, res) => {
  try {
    const quotes = await fetchAllQuotes();
    
    // Add cache headers
    if (quotes.cached) {
      res.set('X-Cache', 'HIT');
    } else {
      res.set('X-Cache', 'MISS');
    }
    
    res.json({
      status: 'success',
      data: quotes,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /quotes:', error);
    
    // Try to serve from cache if available
    const cached = CACHE.get('all_quotes');
    if (cached) {
      console.log('Serving from cache due to error');
      res.set('X-Cache', 'HIT (fallback)');
      return res.json({
        status: 'success',
        data: cached.data,
        timestamp: new Date().toISOString(),
        fromCache: true,
        error: 'Falling back to cached data: ' + error.message
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch quotes',
      error: config.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
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

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database connection
    const db = await getDb();
    console.log('Database connected');
    
    // Start the server
    const server = app.listen(config.PORT, () => {
      const { address, port } = server.address();
      const host = address === '::' ? 'localhost' : address;
      
      console.log(`
  Server running in ${config.NODE_ENV} mode
  Local:   http://${host}:${port}
  Network: http://${require('ip').address()}:${port}
`);
      
      // Initial fetch of quotes
      fetchAllQuotes()
        .then(() => console.log('Initial quotes fetched successfully'))
        .catch(err => console.error('Error fetching initial quotes:', err));
      
      // Refresh quotes at regular intervals
      const REFRESH_INTERVAL = 30000; // 30 seconds
      setInterval(() => {
        const startTime = Date.now();
        console.log('Refreshing quotes...');
        
        fetchAllQuotes()
          .then(() => {
            console.log(`Quotes refreshed in ${Date.now() - startTime}ms`);
          })
          .catch(err => {
            console.error('Error refreshing quotes:', err.message);
          });
      }, REFRESH_INTERVAL);
    });
    
    // Handle process termination
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      
      try {
        // Close the server first to stop accepting new connections
        server.close(() => {
          console.log('Server closed');
        });
        
        // Close database connection
        if (db) {
          await db.close();
          console.log('Database connection closed');
        }
        
        console.log('Shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    // Handle process termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't shut down for unhandled rejections to keep the server running
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// Start the server
startServer();
