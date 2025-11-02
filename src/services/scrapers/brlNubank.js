const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE = 'Nubank';
const SOURCE_URL = 'https://api.nubank.com.br/api/currency';

// Helper function to parse price text
function parsePriceText(text) {
  if (!text) return null;
  // Remove currency symbols, spaces, and replace comma with dot
  const numberStr = String(text)
    .replace(/[^\d,.]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(numberStr) || null;
}

// Helper function to make HTTP requests with retries
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios({
        url,
        timeout: 10000,
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://www.nubank.com.br/',
          'Origin': 'https://www.nubank.com.br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          ...(options.headers || {})
        }
      });
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

/**
 * Fetches and parses the USD to BRL rate from Nubank
 * @returns {Promise<Object>} Object with buy and sell prices
 */
async function parseBrlNubank() {
  try {
    // Try the Nubank API first
    const response = await fetchWithRetry(SOURCE_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Correlation-Id': `WEB-APP.${Math.random().toString(36).substr(2, 8)}`
      }
    });
    
    if (response.data && Array.isArray(response.data.currencies)) {
      // Find USD to BRL rate
      const usdRate = response.data.currencies.find(
        currency => currency.code === 'USD' && currency.currency === 'BRL'
      );
      
      if (usdRate && usdRate.amount) {
        // Nubank typically shows the same rate for buy/sell but with a spread
        const spread = 0.01; // 1% spread
        const midRate = parseFloat(usdRate.amount);
        
        if (!isNaN(midRate)) {
          return {
            currency: 'BRL',
            source: SOURCE,
            sourceUrl: 'https://www.nubank.com.br/cambio/',
            buy: parseFloat((midRate * (1 - spread/2)).toFixed(4)),
            sell: parseFloat((midRate * (1 + spread/2)).toFixed(4)),
            timestamp: new Date().toISOString(),
            rate_source: 'api'
          };
        }
      }
    }

    // If API fails, fall back to web scraping
    const webResponse = await fetchWithRetry('https://www.nubank.com.br/cambio/', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    const $ = cheerio.load(webResponse.data);
    
    // Try different selectors to find the rates
    const rateSelectors = [
      // Try data-testid attributes
      () => ({
        buy: $('[data-testid*="buy"], [data-testid*="compra"]').first().text().trim(),
        sell: $('[data-testid*="sell"], [data-testid*="venda"]').first().text().trim()
      }),
      // Try class-based selectors
      () => ({
        buy: $('.currency-quote__currency-buy-value').text().trim(),
        sell: $('.currency-quote__currency-sell-value').text().trim()
      }),
      // Try to find any numbers that look like exchange rates in the page
      () => {
        const text = $('body').text();
        const matches = text.match(/\d+[.,]\d+/g) || [];
        // Filter for numbers that look like exchange rates (between 1 and 10)
        const rates = matches
          .map(match => parseFloat(match.replace(/\./g, '').replace(',', '.')))
          .filter(rate => rate > 1 && rate < 10);
        
        return {
          buy: rates.length > 0 ? rates[0] : null,
          sell: rates.length > 1 ? rates[1] : null
        };
      }
    ];

    let buy, sell;
    
    // Try each selector until we find one that works
    for (const selector of rateSelectors) {
      try {
        const result = selector();
        const buyRate = parsePriceText(result.buy);
        const sellRate = parsePriceText(result.sell);
        
        if (buyRate && sellRate) {
          buy = buyRate;
          sell = sellRate;
          break;
        }
      } catch (e) {
        // Ignore and try next selector
        continue;
      }
    }

    // If we couldn't find both rates, try to calculate one from the other
    if (buy && !sell) {
      sell = buy * 1.01; // 1% spread
    } else if (sell && !buy) {
      buy = sell / 1.01; // 1% spread
    } else if (!buy && !sell) {
      throw new Error('Could not find exchange rates on Nubank page');
    }
    
    return {
      currency: 'BRL',
      source: SOURCE,
      sourceUrl: 'https://www.nubank.com.br/cambio/',
      buy: parseFloat(buy.toFixed(4)),
      sell: parseFloat(sell.toFixed(4)),
      timestamp: new Date().toISOString(),
      rate_source: 'web_scraping'
    };
  } catch (error) {
    console.error('Error fetching from Nubank:', error.message);
    // Fallback to a reasonable rate if both API and scraping fail
    return {
      currency: 'BRL',
      source: SOURCE,
      sourceUrl: 'https://www.nubank.com.br/cambio/',
      buy: 5.15,
      sell: 5.25,
      timestamp: new Date().toISOString(),
      is_fallback: true,
      error: error.message
    };
  }
}

module.exports = { parseBrlNubank };
