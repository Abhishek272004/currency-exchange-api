const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a temporary test database file
 * @returns {Object} Object containing the database path and a cleanup function
 */
function createTestDb() {
  const testDbPath = path.join(__dirname, `../../test-data/test-${uuidv4()}.db`);
  
  // Ensure the test-data directory exists
  const testDataDir = path.dirname(testDbPath);
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
  
  // Create an empty file
  fs.writeFileSync(testDbPath, '');
  
  // Cleanup function to remove the test database
  const cleanup = () => {
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      // Remove test-data directory if empty
      if (fs.readdirSync(testDataDir).length === 0) {
        fs.rmdirSync(testDataDir);
      }
    } catch (error) {
      console.error('Error cleaning up test database:', error);
    }
  };
  
  // Handle process exit to ensure cleanup
  process.on('exit', cleanup);
  
  return {
    testDbPath,
    cleanup,
  };
}

/**
 * Creates a test configuration object
 * @param {string} dbPath - Path to the test database
 * @returns {Object} Test configuration
 */
function createTestConfig(dbPath) {
  return {
    PORT: 3000,
    NODE_ENV: 'test',
    DATABASE_PATH: dbPath,
    CORS_ORIGIN: '*',
    QUOTE_TTL_SECONDS: 60,
  };
}

module.exports = {
  createTestDb,
  createTestConfig,
};
