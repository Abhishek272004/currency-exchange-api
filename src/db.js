const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATABASE_PATH } = require('./config');

// Ensure database directory exists
const dbDir = path.dirname(DATABASE_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database with WAL mode for better concurrency
const db = new Database(DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables if they don't exist
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    try {
      // Enable foreign keys and other PRAGMAs
      db.pragma('synchronous = NORMAL');
      db.pragma('temp_store = MEMORY');
      
      // Create tables in a transaction
      db.exec(`
        BEGIN;
        
        -- Currencies table
        CREATE TABLE IF NOT EXISTS currencies (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          symbol TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
        
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
          fee_percentage REAL DEFAULT 0,
          timestamp INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
          FOREIGN KEY (base_currency) REFERENCES currencies(code),
          FOREIGN KEY (target_currency) REFERENCES currencies(code),
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
        
        -- Insert default currencies if they don't exist
        INSERT OR IGNORE INTO currencies (code, name, symbol) VALUES 
          ('USD', 'US Dollar', '$'),
          ('ARS', 'Argentine Peso', '$'),
          ('BRL', 'Brazilian Real', 'R$');
        
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
      
      // Create prepared statements
      db.prepare(`
        INSERT INTO exchange_rates 
        (base_currency, target_currency, source_id, buy_rate, sell_rate, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(base_currency, target_currency, source_id, timestamp) 
        DO UPDATE SET 
          buy_rate = excluded.buy_rate,
          sell_rate = excluded.sell_rate,
          updated_at = strftime('%s', 'now')
      `);
      
      db.prepare(`
        INSERT INTO historical_rates 
        (base_currency, target_currency, source_id, buy_rate, sell_rate, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      console.log('Database initialized successfully');
      resolve();
    } catch (error) {
      console.error('Error initializing database:', error);
      db.exec('ROLLBACK');
      reject(error);
    }
  });
}

// Database operations
const dbOperations = {
  // Save exchange rate
  async saveExchangeRate(rateData) {
    const { baseCurrency, targetCurrency, source, buyRate, sellRate, timestamp } = rateData;
    
    return new Promise((resolve, reject) => {
      try {
        // Get or create source
        let sourceId = db.prepare('SELECT id FROM sources WHERE name = ?').get(source)?.id;
        
        if (!sourceId) {
          const result = db.prepare('INSERT INTO sources (name, url) VALUES (?, ?)').run(source, '');
          sourceId = result.lastInsertRowid;
        }
        
        // Save to exchange_rates
        const result = db.prepare(`
          INSERT INTO exchange_rates 
          (base_currency, target_currency, source_id, buy_rate, sell_rate, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(base_currency, target_currency, source_id) 
          DO UPDATE SET 
            buy_rate = excluded.buy_rate,
            sell_rate = excluded.sell_rate,
            timestamp = excluded.timestamp,
            updated_at = strftime('%s', 'now')
          RETURNING *
        `).get(
          baseCurrency,
          targetCurrency,
          sourceId,
          buyRate,
          sellRate,
          timestamp || Math.floor(Date.now() / 1000)
        );
        
        // Also save to historical_rates
        db.prepare(`
          INSERT INTO historical_rates 
          (base_currency, target_currency, source_id, buy_rate, sell_rate, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          baseCurrency,
          targetCurrency,
          sourceId,
          buyRate,
          sellRate,
          timestamp || Math.floor(Date.now() / 1000)
        );
        
        resolve(result);
      } catch (error) {
        console.error('Error saving exchange rate:', error);
        reject(error);
      }
    });
  },
  
  // Get latest rates for a currency pair
  getLatestRates(baseCurrency, targetCurrency) {
    try {
      return db.prepare(`
        SELECT 
          er.*, 
          s.name as source_name,
          s.url as source_url
        FROM exchange_rates er
        JOIN sources s ON er.source_id = s.id
        WHERE er.base_currency = ? AND er.target_currency = ?
        ORDER BY er.timestamp DESC
      `).all(baseCurrency, targetCurrency);
    } catch (error) {
      console.error('Error getting latest rates:', error);
      throw error;
    }
  },
  
  // Calculate average rates
  calculateAverages(baseCurrency, targetCurrency) {
    try {
      return db.prepare(`
        SELECT 
          AVG(buy_rate) as avg_buy_rate,
          AVG(sell_rate) as avg_sell_rate,
          COUNT(*) as source_count
        FROM exchange_rates
        WHERE base_currency = ? AND target_currency = ?
      `).get(baseCurrency, targetCurrency);
    } catch (error) {
      console.error('Error calculating averages:', error);
      throw error;
    }
  },
  
  // Calculate slippage
  calculateSlippage(baseCurrency, targetCurrency) {
    try {
      const averages = this.calculateAverages(baseCurrency, targetCurrency);
      
      return db.prepare(`
        SELECT 
          er.*,
          s.name as source_name,
          s.url as source_url,
          (er.buy_rate - ?) / ? * 100 as buy_slippage_percent,
          (er.sell_rate - ?) / ? * 100 as sell_slippage_percent
        FROM exchange_rates er
        JOIN sources s ON er.source_id = s.id
        WHERE er.base_currency = ? AND er.target_currency = ?
        ORDER BY er.timestamp DESC
      `).all(
        averages.avg_buy_rate,
        averages.avg_buy_rate,
        averages.avg_sell_rate,
        averages.avg_sell_rate,
        baseCurrency,
        targetCurrency
      );
    } catch (error) {
      console.error('Error calculating slippage:', error);
      throw error;
    }
  },
  
  // Get historical rates for analytics
  getHistoricalRates(baseCurrency, targetCurrency, hours = 24) {
    try {
      const since = Math.floor(Date.now() / 1000) - (hours * 3600);
      
      return db.prepare(`
        SELECT 
          hr.*,
          s.name as source_name,
          s.url as source_url
        FROM historical_rates hr
        LEFT JOIN sources s ON hr.source_id = s.id
        WHERE 
          hr.base_currency = ? 
          AND hr.target_currency = ?
          AND hr.timestamp >= ?
        ORDER BY hr.timestamp ASC
      `).all(baseCurrency, targetCurrency, since);
    } catch (error) {
      console.error('Error getting historical rates:', error);
      throw error;
    }
  },
  
  // Begin transaction
  beginTransaction() {
    return db.prepare('BEGIN').run();
  },
  
  // Commit transaction
  commit() {
    return db.prepare('COMMIT').run();
  },
  
  // Rollback transaction
  rollback() {
    return db.prepare('ROLLBACK').run();
  },
  
  // Run raw query (for testing/debugging)
  run(query, params = []) {
    try {
      return db.prepare(query).run(...params);
    } catch (error) {
      console.error('Error running query:', error);
      throw error;
    }
  },
  
  // Get all active sources
  getActiveSources() {
    try {
      return db.prepare('SELECT * FROM sources WHERE is_active = 1').all();
    } catch (error) {
      console.error('Error getting active sources:', error);
      throw error;
    }
  }
};

// Close database connection on process exit
process.on('exit', () => {
  db.close();
});

module.exports = {
  db,
  initializeDatabase,
  ...dbOperations
};
