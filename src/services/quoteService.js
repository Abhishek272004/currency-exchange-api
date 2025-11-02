const config = require('../config');
const db = require('../db');
const httpClient = require('../utils/httpClient');
const { parseArsAmbito } = require('./scrapers/arsAmbito');
const { parseArsDolarHoy } = require('./scrapers/arsDolarHoy');
const { parseArsCronista } = require('./scrapers/arsCronista');
const { parseBrlWise } = require('./scrapers/brlWise');
const { parseBrlNubank } = require('./scrapers/brlNubank');
const { parseBrlNomad } = require('./scrapers/brlNomad');

const CACHE = new Map();
const CACHE_DURATION = 30000; // 30 seconds

/**
 * Fetches all quotes from all sources
 * @returns {Promise<Array>} Array of quote objects
 */
async function fetchAllQuotes() {
  const now = Date.now();
  const cacheKey = 'all-quotes';
  
  // Return cached data if still valid
  const cached = CACHE.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Fetch all quotes in parallel
    const [arsQuotes, brlQuotes] = await Promise.all([
      fetchArsQuotes(),
      fetchBrlQuotes()
    ]);

    // Combine all quotes
    const allQuotes = [...arsQuotes, ...brlQuotes];
    
    // Cache the result
    const result = {
      timestamp: new Date().toISOString(),
      quotes: allQuotes
    };
    
    CACHE.set(cacheKey, {
      data: result,
      timestamp: now
    });

    // Store in database
    await storeQuotesInDb(allQuotes);

    return result;
  } catch (error) {
    console.error('Error in fetchAllQuotes:', error);
    throw error;
  }
}

/**
 * Fetches ARS quotes from all sources
 */
async function fetchArsQuotes() {
  const results = [];
  
  // Fetch from Ambito
  try {
    const ambitoHtml = await httpClient.get('https://mercados.ambito.com/dolar/oficial/variacion');
    const ambitoData = parseArsAmbito(ambitoHtml);
    if (ambitoData) results.push({
      ...ambitoData,
      currency: 'ARS',
      base_currency: 'USD',
      source: 'Ambito',
      source_url: 'https://www.ambito.com/contenidos/dolar.html',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching from Ambito:', error.message);
  }

  // Fetch from DolarHoy
  try {
    const dolarHoyHtml = await httpClient.get('https://dolarhoy.com/');
    const dolarHoyData = parseArsDolarHoy(dolarHoyHtml);
    if (dolarHoyData) results.push({
      ...dolarHoyData,
      currency: 'ARS',
      base_currency: 'USD',
      source: 'DolarHoy',
      source_url: 'https://www.dolarhoy.com',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching from DolarHoy:', error.message);
  }

  // Fetch from Cronista
  try {
    const cronistaHtml = await httpClient.get('https://www.cronista.com/MercadosOnline/moneda.html?id=ARSB');
    const cronistaData = parseArsCronista(cronistaHtml);
    if (cronistaData) results.push({
      ...cronistaData,
      currency: 'ARS',
      base_currency: 'USD',
      source: 'Cronista',
      source_url: 'https://www.cronista.com/MercadosOnline/moneda.html?id=ARSB',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching from Cronista:', error.message);
  }

  return results;
}

/**
 * Fetches BRL quotes from all sources
 */
async function fetchBrlQuotes() {
  const results = [];
  
  // Fetch from Wise
  try {
    const wiseData = await parseBrlWise();
    if (wiseData) results.push({
      ...wiseData,
      currency: 'BRL',
      base_currency: 'USD',
      source: 'Wise',
      source_url: 'https://wise.com/us/currency-converter/usd-to-brl-rate',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching from Wise:', error.message);
  }

  // Fetch from Nubank
  try {
    const nubankData = await parseBrlNubank();
    if (nubankData) results.push({
      ...nubankData,
      currency: 'BRL',
      base_currency: 'USD',
      source: 'Nubank',
      source_url: 'https://nubank.com.br/cambio/hoje',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching from Nubank:', error.message);
  }

  // Fetch from Nomad
  try {
    const nomadData = await parseBrlNomad();
    if (nomadData) results.push({
      ...nomadData,
      currency: 'BRL',
      base_currency: 'USD',
      source: 'Nomad',
      source_url: 'https://www.nomadprelo.com.br/cambio',
      timestamp: new Date().toISOString()
    });
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

  const timestamp = new Date().toISOString();
  
  try {
    await db.beginTransaction();
    
    for (const quote of quotes) {
      await db.run(
        `INSERT INTO quotes 
         (currency, source, source_url, buy_price, sell_price, fetched_at, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(currency, source) 
         DO UPDATE SET 
           buy_price = excluded.buy_price,
           sell_price = excluded.sell_price,
           fetched_at = excluded.fetched_at,
           timestamp = excluded.timestamp`,
        [
          quote.currency,
          quote.source,
          quote.source_url,
          quote.buy_price,
          quote.sell_price || null,
          Date.now(),
          timestamp
        ]
      );
    }
    
    await db.commit();
  } catch (error) {
    await db.rollback();
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
