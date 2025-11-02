const { createTestDb, createTestConfig } = require('./__utils__/testUtils');
const Database = require('better-sqlite3');

// Mock the config module
jest.mock('../src/config', () => ({
  DATABASE_PATH: '',
  NODE_ENV: 'test',
}));

// Import the db module after mocking config
const dbModule = require('../src/db');

describe('Database Module', () => {
  let testDb;
  let testDbPath;
  let cleanup;

  beforeAll(() => {
    // Create a test database
    const testDbInfo = createTestDb();
    testDbPath = testDbInfo.testDbPath;
    cleanup = testDbInfo.cleanup;
    
    // Update the config with the test database path
    const testConfig = createTestConfig(testDbPath);
    jest.mock('../src/config', () => testConfig);
  });

  afterAll(() => {
    // Clean up the test database
    cleanup();
  });

  beforeEach(async () => {
    // Re-import the module to get a fresh instance with the test config
    jest.resetModules();
    const freshDbModule = require('../src/db');
    Object.assign(dbModule, freshDbModule);
    
    // Initialize the database
    await dbModule.initializeDatabase();
  });

  afterEach(() => {
    // Close the database connection
    if (dbModule.db) {
      dbModule.db.close();
    }
  });

  describe('initializeDatabase()', () => {
    test('should create all required tables', async () => {
      // Verify tables were created
      const tables = dbModule.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map(t => t.name);
      
      expect(tables).toContain('currencies');
      expect(tables).toContain('sources');
      expect(tables).toContain('exchange_rates');
      expect(tables).toContain('historical_rates');
    });

    test('should insert default currencies', async () => {
      const currencies = dbModule.db
        .prepare('SELECT * FROM currencies')
        .all();
      
      expect(currencies).toHaveLength(3);
      expect(currencies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'USD' }),
          expect.objectContaining({ code: 'ARS' }),
          expect.objectContaining({ code: 'BRL' }),
        ])
      );
    });
  });

  describe('saveExchangeRate()', () => {
    test('should save a new exchange rate', async () => {
      const rateData = {
        baseCurrency: 'USD',
        targetCurrency: 'BRL',
        source: 'Test Source',
        buyRate: 5.25,
        sellRate: 5.35,
      };

      const result = await dbModule.saveExchangeRate(rateData);
      expect(result).toBeDefined();
      
      // Verify the rate was saved
      const rates = dbModule.getLatestRates('USD', 'BRL');
      expect(rates).toHaveLength(1);
      expect(rates[0]).toMatchObject({
        base_currency: 'USD',
        target_currency: 'BRL',
        source_name: 'Test Source',
        buy_rate: 5.25,
        sell_rate: 5.35,
      });
    });
  });

  describe('calculateAverages()', () => {
    beforeEach(async () => {
      // Insert test data
      const testRates = [
        { base: 'USD', target: 'BRL', source: 'Source1', buy: 5.0, sell: 5.1 },
        { base: 'USD', target: 'BRL', source: 'Source2', buy: 5.2, sell: 5.3 },
        { base: 'USD', target: 'BRL', source: 'Source3', buy: 5.4, sell: 5.5 },
      ];

      for (const rate of testRates) {
        await dbModule.saveExchangeRate({
          baseCurrency: rate.base,
          targetCurrency: rate.target,
          source: rate.source,
          buyRate: rate.buy,
          sellRate: rate.sell,
        });
      }
    });

    test('should calculate correct averages', () => {
      const averages = dbModule.calculateAverages('USD', 'BRL');
      
      // (5.0 + 5.2 + 5.4) / 3 = 5.2
      // (5.1 + 5.3 + 5.5) / 3 = 5.3
      expect(averages.avg_buy_rate).toBeCloseTo(5.2);
      expect(averages.avg_sell_rate).toBeCloseTo(5.3);
      expect(averages.source_count).toBe(3);
    });
  });

  describe('calculateSlippage()', () => {
    test('should calculate correct slippage percentages', () => {
      // Averages are 5.2 (buy) and 5.3 (sell) from previous test
      const slippage = dbModule.calculateSlippage('USD', 'BRL');
      
      expect(slippage).toHaveLength(3);
      
      // Test slippage calculation for the first source
      const source1 = slippage.find(s => s.source_name === 'Source1');
      expect(source1).toBeDefined();
      
      // Buy slippage: (5.0 - 5.2) / 5.2 * 100 ≈ -3.8462%
      expect(parseFloat(source1.buy_slippage_percent)).toBeCloseTo(-3.8462, 4);
      
      // Sell slippage: (5.1 - 5.3) / 5.3 * 100 ≈ -3.7736%
      expect(parseFloat(source1.sell_slippage_percent)).toBeCloseTo(-3.7736, 4);
    });
  });
});
