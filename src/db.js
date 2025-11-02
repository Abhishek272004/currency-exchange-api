const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

// For Vercel, use a temporary file in the /tmp directory
const isVercel = process.env.VERCEL === '1';
const dbPath = isVercel 
  ? '/tmp/currency_exchange.db' 
  : path.join(__dirname, '../../data/currency_exchange.db');

// Ensure directory exists
if (!isVercel) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let dbInstance = null;

async function getDb() {
  if (!dbInstance) {
    dbInstance = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    await dbInstance.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = MEMORY;
    `);

    await initializeDatabase(dbInstance);
  }
  return dbInstance;
}

// Create tables if they don't exist
async function initializeDatabase(db) {
  try {
    await db.exec(`
      BEGIN TRANSACTION;

      -- Sources table
      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      -- Exchange rates table
      CREATE TABLE IF NOT EXISTS exchange_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        base_currency TEXT NOT NULL,
        target_currency TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        buy_rate REAL NOT NULL,
        sell_rate REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
        UNIQUE(base_currency, target_currency, source_id, timestamp)
      );

      -- Historical rates (for analytics)
      CREATE TABLE IF NOT EXISTS historical_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        base_currency TEXT NOT NULL,
        target_currency TEXT NOT NULL,
        source_id INTEGER,
        buy_rate REAL NOT NULL,
        sell_rate REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_pair
      ON exchange_rates(base_currency, target_currency);

      CREATE INDEX IF NOT EXISTS idx_exchange_rates_timestamp
      ON exchange_rates(timestamp);

      CREATE INDEX IF NOT EXISTS idx_historical_rates_currency_pair
      ON historical_rates(base_currency, target_currency);

      CREATE INDEX IF NOT EXISTS idx_historical_rates_timestamp
      ON historical_rates(timestamp);

      -- Insert default sources if they don't exist
      INSERT OR IGNORE INTO sources (name, url) VALUES
        ('Ambito', 'https://www.ambito.com/contenidos/dolar.html'),
        ('DolarHoy', 'https://www.dolarhoy.com'),
        ('Cronista', 'https://www.cronista.com/MercadosOnline/moneda.html?id=ARSB'),
        ('Wise', 'https://wise.com/us/currency-converter/usd-to-brl-rate'),
        ('Nubank', 'https://nubank.com.br/cambio/hoje'),
        ('Nomad', 'https://www.nomadprelo.com.br/cambio');

      COMMIT;
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Database operations
const dbOperations = {
  // Save exchange rate
  async saveExchangeRate(rateData) {
    const db = await getDb();
    const { baseCurrency, targetCurrency, source, buyRate, sellRate, timestamp = Date.now() } = rateData;

    try {
      // Start transaction
      await db.run('BEGIN TRANSACTION');

      // Get or create source
      let sourceResult = await db.get('SELECT id FROM sources WHERE name = ?', [source]);
      let sourceId = sourceResult ? sourceResult.id : null;

      if (!sourceId) {
        const result = await db.run('INSERT INTO sources (name, url) VALUES (?, ?)', [source, '']);
        sourceId = result.lastID;
      }

      // Insert exchange rate
      await db.run(
        `INSERT INTO exchange_rates
         (base_currency, target_currency, source_id, buy_rate, sell_rate, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(base_currency, target_currency, source_id, timestamp)
         DO UPDATE SET
           buy_rate = excluded.buy_rate,
           sell_rate = excluded.sell_rate`,
        [baseCurrency, targetCurrency, sourceId, buyRate, sellRate, timestamp]
      );

      // Also save to historical rates
      await db.run(
        `INSERT INTO historical_rates
         (base_currency, target_currency, source_id, buy_rate, sell_rate, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [baseCurrency, targetCurrency, sourceId, buyRate, sellRate, timestamp]
      );

      await db.run('COMMIT');
      return true;
    } catch (error) {
      await db.run('ROLLBACK');
      console.error('Error saving exchange rate:', error);
      throw error;
    }
  },

  // Get latest rates for a currency pair
  async getLatestRates(baseCurrency, targetCurrency) {
    try {
      const db = await getDb();
      return await db.get(
        `SELECT er.*, s.name as source_name
         FROM exchange_rates er
         JOIN sources s ON er.source_id = s.id
         WHERE er.base_currency = ? AND er.target_currency = ?
         ORDER BY er.timestamp DESC
         LIMIT 1`,
        [baseCurrency, targetCurrency]
      );
    } catch (error) {
      console.error('Error getting latest rates:', error);
      throw error;
    }
  },

  // Get historical rates
  async getHistoricalRates(baseCurrency, targetCurrency, hours = 24) {
    try {
      const db = await getDb();
      const timestamp = Date.now() - (hours * 60 * 60 * 1000);

      return await db.all(
        `SELECT
           er.*,
           s.name as source_name,
           datetime(er.timestamp / 1000, 'unixepoch') as formatted_time
         FROM exchange_rates er
         JOIN sources s ON er.source_id = s.id
         WHERE er.base_currency = ?
           AND er.target_currency = ?
           AND er.timestamp >= ?
         ORDER BY er.timestamp DESC`,
        [baseCurrency, targetCurrency, timestamp]
      );
    } catch (error) {
      console.error('Error getting historical rates:', error);
      throw error;
    }
  },

  // Get all active sources
  async getActiveSources() {
    try {
      const db = await getDb();
      return await db.all('SELECT * FROM sources WHERE is_active = 1');
    } catch (error) {
      console.error('Error getting active sources:', error);
      throw error;
    }
  },

  // Run raw query (for testing/debugging)
  async runQuery(query, params = []) {
    try {
      const db = await getDb();
      return await db.all(query, params);
    } catch (error) {
      console.error('Error running query:', error);
      throw error;
    }
  },
  
  // Close database connection
  async close() {
    if (dbInstance) {
      await dbInstance.close();
      dbInstance = null;
    }
  }
};

// Close database connection on process exit
process.on('exit', () => {
  if (dbInstance) {
    dbInstance.close();
  }
});

process.on('SIGINT', () => {
  if (dbInstance) {
    dbInstance.close();
  }
  process.exit(0);
});

module.exports = {
  getDb,
  ...dbOperations
};
