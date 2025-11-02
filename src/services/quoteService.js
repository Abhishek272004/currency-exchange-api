const config = require('../config');
const { getDb } = require('../db');
const httpClient = require('../utils/httpClient');
const statusTracker = require('../utils/statusTracker');
const fetchAmbitoQuote = require('./scrapers/arsAmbito');
const fetchDolarHoyQuote = require('./scrapers/arsDolarHoy');
const { parseArsCronista } = require('./scrapers/arsCronista');
const { parseBrlWise } = require('./scrapers/brlWise');
const { parseBrlNubank } = require('./scrapers/brlNubank');
const { parseBrlNomad } = require('./scrapers/brlNomad');

const CACHE = new Map();
const CACHE_DURATION = 30000; // 30 seconds

// Source configurations with metadata
const SOURCES = {
  AMBITO: {
    name: 'Ambito',
    currency: 'ARS',
    fetcher: fetchAmbitoQuote,
    enabled: true
  },
  DOLAR_HOY: {
    name: 'DolarHoy',
    currency: 'ARS',
    fetcher: fetchDolarHoyQuote,
    enabled: true
  },
  CRONISTA: {
    name: 'Cronista',
    currency: 'ARS',
    fetcher: parseArsCronista,
    enabled: true
  },
  WISE: {
    name: 'Wise',
    currency: 'BRL',
    fetcher: parseBrlWise,
    enabled: true
  },
  NUBANK: {
    name: 'Nubank',
    currency: 'BRL',
    fetcher: parseBrlNubank,
    enabled: true
  },
  NOMAD: {
    name: 'Nomad',
    currency: 'BRL',
    fetcher: parseBrlNomad,
    enabled: true
  }
};

/**
 * Fetches quotes from a single source with error handling and status tracking
 */
async function fetchFromSource(sourceConfig) {
  const startTime = Date.now();
  const sourceName = sourceConfig.name;
  
  try {
    if (!sourceConfig.enabled) {
      throw new Error('Source is disabled');
    }

    const data = await sourceConfig.fetcher();
    const processingTime = Date.now() - startTime;
    
    statusTracker.updateStatus(sourceName, {
      success: true,
      timestamp: Date.now(),
      processingTime
    });
    
    return {
      ...data,
      source: sourceName,
      currency: sourceConfig.currency,
      base_currency: 'USD',
      timestamp: new Date().toISOString(),
      processingTime
    };
  } catch (error) {
    console.error(`Error fetching from ${sourceName}:`, error.message);
    
    statusTracker.updateStatus(sourceName, {
      success: false,
      error,
      timestamp: Date.now()
    });
    
    // Return null if the source fails
    return null;
  }
}

/**
 * Fetches all quotes from all enabled sources in parallel
 * @returns {Promise<Object>} Object containing quotes, averages, and status
 */
async function fetchAllQuotes() {
  const cacheKey = 'all_quotes';
  const cached = CACHE.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    return { ...cached.data, cached: true };
  }

  try {
    // Fetch from all enabled sources in parallel
    const fetchPromises = Object.values(SOURCES)
      .filter(source => source.enabled)
      .map(source => fetchFromSource(source));
    
    const results = await Promise.allSettled(fetchPromises);
    
    // Filter out failed fetches and extract values
    const allQuotes = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);

    // Calculate averages
    const averages = calculateAverages(allQuotes);
    const status = statusTracker.getStatus();
    
    const result = {
      quotes: allQuotes,
      averages,
      status,
      timestamp: new Date().toISOString()
    };

    // Update cache
    CACHE.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    // Store in database
    if (allQuotes.length > 0) {
      await storeQuotesInDb(allQuotes).catch(err => {
        console.error('Error storing quotes in database:', err);
      });
    }

    return result;
  } catch (error) {
    console.error('Error in fetchAllQuotes:', error);
    throw error;
  }
}

/**
 * Fetches ARS quotes from all ARS sources
 * @deprecated Use fetchAllQuotes instead
 */
async function fetchArsQuotes() {
  const results = [];
  
  // Fetch from Ambito
  try {
    const ambitoData = await fetchAmbitoQuote();
    if (ambitoData) {
      results.push({
        ...ambitoData,
        base_currency: 'USD',
        source: 'Ambito',
        source_url: 'https://www.ambito.com/contenidos/dolar.html',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error fetching from Ambito:', error.message);
  }

  // Fetch from DolarHoy
  try {
    const dolarHoyData = await fetchDolarHoyQuote();
    if (dolarHoyData) {
      results.push({
        ...dolarHoyData,
        base_currency: 'USD',
        source: 'DolarHoy',
        source_url: 'https://www.dolarhoy.com',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error fetching from DolarHoy:', error.message);
  }

  // Fetch from Cronista
  try {
    const cronistaData = await fetchCronistaQuote();
    if (cronistaData) {
      results.push({
        ...cronistaData,
        base_currency: 'USD',
        source: 'Cronista',
        source_url: 'https://www.cronista.com/MercadosOnline/moneda.html?id=ARSB',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error fetching from Cronista:', error.message);
  }

  return results;
}

/**
 * Fetches BRL quotes from all BRL sources
 * @deprecated Use fetchAllQuotes instead
 */
async function fetchBrlQuotes() {
  const results = [];
  
  // Fetch from Wise
  try {
    const wiseData = await parseBrlWise();
    if (wiseData) {
      results.push({
        ...wiseData,
        currency: 'BRL',
        base_currency: 'USD',
        source: 'Wise',
        source_url: 'https://wise.com/us/currency-converter/usd-to-brl-rate',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error fetching from Wise:', error.message);
  }

  // Fetch from Nubank
  try {
    const nubankData = await parseBrlNubank();
    if (nubankData) {
      results.push({
        ...nubankData,
        currency: 'BRL',
        base_currency: 'USD',
        source: 'Nubank',
        source_url: 'https://nubank.com.br/cambio/hoje',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error fetching from Nubank:', error.message);
  }

  // Fetch from Nomad
  try {
    const nomadData = await parseBrlNomad();
    if (nomadData) {
      results.push({
        ...nomadData,
        currency: 'BRL',
        base_currency: 'USD',
        source: 'Nomad',
        source_url: 'https://www.nomadprelo.com.br/cambio',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error fetching from Nomad:', error.message);
  }

  return results;
}

/**
 * Calculates average buy and sell prices from quotes
 * @param {Array} quotes - Array of quote objects
 * @returns {Object} Object with average_buy_price and average_sell_price
 */
function calculateAverages(quotes) {
  if (!quotes || !quotes.length) {
    return {
      average_buy_price: null,
      average_sell_price: null,
      timestamp: new Date().toISOString()
    };
  }

  const { buySum, sellSum, count } = quotes.reduce((acc, quote) => {
    if (quote.buy_price) {
      acc.buySum += parseFloat(quote.buy_price);
      acc.sellSum += parseFloat(quote.sell_price || quote.buy_price * 1.02); // Add spread if sell not available
      acc.count++;
    }
    return acc;
  }, { buySum: 0, sellSum: 0, count: 0 });

  return {
    average_buy_price: count > 0 ? (buySum / count).toFixed(4) : null,
    average_sell_price: count > 0 ? (sellSum / count).toFixed(4) : null,
    timestamp: new Date().toISOString(),
    quote_count: count
  };
}

/**
 * Calculates slippage for each quote compared to the average
 * @param {Array} quotes - Array of quote objects
 * @param {Object} averages - Object with average_buy_price and average_sell_price
 * @returns {Array} Array of objects with slippage information
 */
function calculateSlippage(quotes, averages) {
  if (!quotes || !quotes.length || !averages || 
      averages.average_buy_price === null || 
      averages.average_sell_price === null) {
    return [];
  }

  return quotes.map(quote => {
    const buyPrice = parseFloat(quote.buy_price);
    const sellPrice = parseFloat(quote.sell_price || quote.buy_price * 1.02);
    const avgBuy = parseFloat(averages.average_buy_price);
    const avgSell = parseFloat(averages.average_sell_price);

    return {
      source: quote.source,
      source_url: quote.source_url,
      buy_price: buyPrice,
      sell_price: sellPrice,
      buy_price_slippage: ((buyPrice - avgBuy) / avgBuy).toFixed(4),
      sell_price_slippage: ((sellPrice - avgSell) / avgSell).toFixed(4),
      timestamp: new Date().toISOString()
    };
  });
}

/**
 * Stores quotes in the database
 * @param {Array} quotes - Array of quote objects
 */
async function storeQuotesInDb(quotes) {
  if (!quotes || !quotes.length) return;

  const db = await getDb();
  const timestamp = Date.now();
  
  try {
    await db.run('BEGIN TRANSACTION');
    
    for (const quote of quotes) {
      // First, get or create the source
      let sourceResult = await db.get('SELECT id FROM sources WHERE name = ?', [quote.source]);
      let sourceId = sourceResult ? sourceResult.id : null;

      if (!sourceId) {
        const result = await db.run('INSERT INTO sources (name, url) VALUES (?, ?)', [quote.source, quote.source_url || '']);
        sourceId = result.lastID;
      }
      
      // Ensure we have valid buy and sell prices
      const buyPrice = quote.buy_price || 0;
      // If sell_price is not provided, calculate it with a small spread
      const sellPrice = quote.sell_price || (buyPrice * 1.01); // 1% spread if sell price not provided
      
      // Insert or update the exchange rate
      await db.run(
        `INSERT INTO exchange_rates 
         (base_currency, target_currency, source_id, buy_rate, sell_rate, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(base_currency, target_currency, source_id, timestamp) 
         DO UPDATE SET 
           buy_rate = excluded.buy_rate,
           sell_rate = excluded.sell_rate`,
        [
          'USD',  // base_currency
          quote.currency,  // target_currency
          sourceId,
          buyPrice,
          sellPrice,
          timestamp
        ]
      );
    }
    
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Error storing quotes in database:', error);
    throw error;
  }
}

module.exports = {
  fetchAllQuotes,
  calculateAverages,
  calculateSlippage,
  fetchArsQuotes,
  fetchBrlQuotes
};
