// Set the NODE_ENV to 'test' for all tests
process.env.NODE_ENV = 'test';

// Set a longer timeout for tests (30 seconds)
jest.setTimeout(30000);

// Mock console methods to keep test output clean
const originalConsole = { ...console };

global.beforeEach(() => {
  // Mock console methods
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
});

global.afterEach(() => {
  // Restore original console methods
  global.console = originalConsole;
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  // Don't log expected assertion errors
  if (reason.name !== 'AssertionError') {
    console.error('Unhandled Rejection:', reason);
  }
});
