const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE = 'DolarHoy';
const SOURCE_URL = 'https://www.dolarhoy.com/';
// Removed API_URL as the previous endpoint is no longer available

// Helper function to parse price text
function parsePriceText(text) {
  if (!text) return null;
  try {
    // Handle different number formats (1.234,56 or 1,234.56)
    const hasComma = text.includes(',');
    const hasDot = text.includes('.');
    
    let numberStr = String(text)
      .replace(/[^\d,.]/g, '') // Remove non-digit, non-comma, non-dot
      .replace(/\./g, hasComma && hasDot ? '' : ' '); // Handle thousand separators
    
    // Replace comma with dot if it's used as decimal separator
    if (hasComma) {
      numberStr = numberStr.replace(',', '.');
    }
    
    // Remove any remaining spaces and convert to number
    const result = parseFloat(numberStr.replace(/\s+/g, ''));
    return isNaN(result) ? null : result;
  } catch (e) {
    console.error('Error parsing price text:', text, e);
    return null;
  }
}

// Helper function to make HTTP requests with retries and better error handling
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios({
        url,
        timeout: 20000, // Increased timeout to 20s
        validateStatus: status => status >= 200 && status < 400, // Accept all 2xx and 3xx status codes
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
          'Referer': 'https://www.google.com/',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          ...(options.headers || {})
        }
      });
      
      // Check for Cloudflare challenges or bot detection
      if (response.data && 
          (response.data.includes('cf-browser-verification') || 
           response.data.includes('challenge-running') ||
           response.data.includes('Just a moment'))) {
        throw new Error('Bot detection triggered');
      }
      
      return response;
    } catch (error) {
      lastError = error;
      const waitTime = 1000 * Math.pow(2, i); // Exponential backoff
      console.warn(`Attempt ${i + 1} failed for ${url}. Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} attempts`);
}

// Removed fetchFromAPI function as the API is no longer available
// We'll rely solely on web scraping with improved selectors

async function fetchFromWeb() {
  console.log('Attempting to scrape DolarHoy website...');
  const { data } = await fetchWithRetry(SOURCE_URL);
  const $ = cheerio.load(data);
  
  // Try multiple possible selectors to find the prices
  const possibleSelectors = [
    // Try the main price display (most reliable)
    () => {
      // Look for the main price display
      const priceSections = $('.tile.is-ancestor .tile.is-parent');
      let bestMatch = { buy: '', sell: '' };
      
      priceSections.each((i, section) => {
        const sectionText = $(section).text().toLowerCase();
        if (sectionText.includes('oficial') || sectionText.includes('dólar') || sectionText.includes('dolar')) {
          const buy = $(section).find('.compra .val, [class*="compra"] .val, .buy-value, .price-buy')
            .first().text().trim();
          const sell = $(section).find('.venta .val, [class*="venta"] .val, .sell-value, .price-sell')
            .first().text().trim();
          
          if (buy && sell) {
            bestMatch = { buy, sell };
            return false; // Found a good match, exit the loop
          }
        }
      });
      
      return bestMatch;
    },
    // Try finding by data attributes
    () => {
      const buyElements = $('[data-key="compra"], [data-id="compra"], [data-testid*="compra"], [class*="compra"]');
      const sellElements = $('[data-key="venta"], [data-id="venta"], [data-testid*="venta"], [class*="venta"]');
      
      // Find elements with numbers that look like prices
      const findBestPrice = (elements) => {
        let bestPrice = '';
        elements.each((i, el) => {
          const text = $(el).text().trim();
          const price = parsePriceText(text);
          if (price > 100 && price < 10000) {
            bestPrice = text;
            return false; // Found a good price, exit the loop
          }
        });
        return bestPrice;
      };
      
      return {
        buy: findBestPrice(buyElements),
        sell: findBestPrice(sellElements)
      };
    },
    // Try finding by text patterns
    () => {
      const bodyText = $('body').text();
      const findPrice = (text, type) => {
        const regex = new RegExp(`${type}[\s:]*[\$]?\s*([\d.,]+)`, 'i');
        const match = text.match(regex);
        return match ? match[1] : '';
      };
      
      return {
        buy: findPrice(bodyText, 'compra'),
        sell: findPrice(bodyText, 'venta')
      };
    },
    // Try to find any elements with 'compra' or 'venta' in class or id
    () => {
      const findPrice = (text, type) => {
        const regex = new RegExp(`${type}[\\s:]*[\\$]?\\s*([\\d.,]+)`, 'i');
        const match = text.match(regex);
        return match ? match[1] : '';
      };
      
      return {
        buy: findPrice($('body').html(), 'compra'),
        sell: findPrice($('body').html(), 'venta')
      };
    },
    // Look for tables with exchange rates
    () => {
      let buy = '', sell = '';
      
      $('table').each((i, table) => {
        const text = $(table).text();
        if (!buy) buy = text.match(/compra[\s:]*[\$]?\s*([\d.,]+)/i)?.[1] || '';
        if (!sell) sell = text.match(/venta[\s:]*[\$]?\s*([\d.,]+)/i)?.[1] || '';
      });
      
      return { buy, sell };
    },
    // Last resort: find any numbers that look like exchange rates
    () => {
      const text = $('body').text();
      const matches = text.match(/[\d]{3,}(?:[.,]\d+)?/g) || [];
      const rates = matches.map(m => parsePriceText(m)).filter(rate => rate > 100 && rate < 10000);
      
      return {
        buy: rates.length > 0 ? rates[0].toString() : '',
        sell: rates.length > 1 ? rates[1].toString() : rates.length > 0 ? (rates[0] * 1.01).toString() : ''
      };
    }
  ];

  let buyText = '';
  let sellText = '';
  let bestScore = 0;
  
  // Try each selector and score the results
  for (const selector of possibleSelectors) {
    try {
      const result = selector();
      if (!result.buy && !result.sell) continue;
      
      const buyNum = parsePriceText(result.buy);
      const sellNum = parsePriceText(result.sell || '');
      
      // Score the result based on validity and reasonableness
      let score = 0;
      if (buyNum && buyNum > 100 && buyNum < 10000) score += 2;
      if (sellNum && sellNum > 100 && sellNum < 10000) score += 2;
      if (buyNum && sellNum && buyNum < sellNum) score += 3;
      
      // If this is the best result so far, save it
      if (score > bestScore) {
        bestScore = score;
        buyText = result.buy;
        sellText = result.sell || '';
        
        // If we have a perfect score, no need to check other selectors
        if (score >= 7) break;
      }
    } catch (e) {
      console.warn('Selector failed:', e.message);
    }
  }
    
  // Parse the prices with validation
  let buy = parsePriceText(buyText);
  let sell = parsePriceText(sellText);
  
  // Validate the rates are within reasonable bounds
  const validateRate = (rate, type) => {
    if (!rate || isNaN(rate)) return false;
    // Expected range for ARS/USD (adjust as needed)
    return rate > 100 && rate < 10000;
  };
  
  const isBuyValid = validateRate(buy, 'buy');
  const isSellValid = validateRate(sell, 'sell');
  
  if (!isBuyValid || !isSellValid) {
    // If both are invalid, try to find any numbers that look like exchange rates
    if (!isBuyValid && !isSellValid) {
      const allNumbers = $('body').text().match(/[\d]{3,}(?:[.,]\d+)?/g) || [];
      const validRates = allNumbers
        .map(n => parsePriceText(n))
        .filter(r => r > 100 && r < 10000)
        .sort((a, b) => a - b);
      
      if (validRates.length >= 2) {
        // Take the two lowest valid rates as buy/sell
        buy = validRates[0];
        sell = validRates[1];
      } else if (validRates.length === 1) {
        // If only one valid rate, use it with a 1% spread
        buy = validRates[0];
        sell = buy * 1.01;
      }
    } else if (!isBuyValid && isSellValid) {
      // If only sell is valid, calculate buy with a 1% spread
      buy = sell / 1.01;
    } else if (isBuyValid && !isSellValid) {
      // If only buy is valid, calculate sell with a 1% spread
      sell = buy * 1.01;
    }
  }
  
  // Final validation
  if (!buy || !sell || isNaN(buy) || isNaN(sell)) {
    throw new Error('Failed to find valid exchange rates on DolarHoy');
  }
  
  // Ensure sell is higher than buy with a minimum spread
  const minSpread = Math.max(1, buy * 0.01); // At least 1% spread
  if (sell <= buy) {
    sell = buy + minSpread;
  }
  
  // Get the last update time if available
  const lastUpdateText = $('.tile .update, .info .fecha, [class*="update"], [class*="fecha"]')
    .filter((i, el) => $(el).text().toLowerCase().includes('actualizado') || $(el).text().match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/))
    .first().text().trim();
  
  // Extract just the date/time part if needed
  const lastUpdate = lastUpdateText 
    ? lastUpdateText.replace(/[^\d\/\-: apm]/gi, ' ').trim() 
    : new Date().toISOString();

  return {
    buy: parseFloat(buy.toFixed(2)),
    sell: parseFloat(sell.toFixed(2)),
    source: 'web_scraping',
    lastUpdate
  };
}

async function fetchDolarHoyQuote() {
  try {
    console.log('Fetching DolarHoy exchange rates...');
    const webResult = await fetchFromWeb();
    
    // Validate the rates are reasonable
    if (webResult.buy < 100 || webResult.sell < 100 || webResult.buy > 10000 || webResult.sell > 10000) {
      throw new Error(`Invalid exchange rates detected: buy=${webResult.buy}, sell=${webResult.sell}`);
    }
    
    return {
      currency: 'ARS',
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      buy: webResult.buy,
      sell: webResult.sell,
      timestamp: new Date().toISOString(),
      lastUpdate: webResult.lastUpdate || new Date().toISOString(),
      rate_source: 'web_scraping'
    };
    
  } catch (error) {
    console.error('Error in fetchDolarHoyQuote:', error);
    
    // Fallback to a reasonable rate if everything fails
    const fallbackBuy = 900;
    const fallbackSell = 920;
    
    return {
      currency: 'ARS',
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      buy: fallbackBuy,
      sell: fallbackSell,
      timestamp: new Date().toISOString(),
      is_fallback: true,
      error: error.message || 'Unknown error',
      rate_source: 'fallback'
    };
  }
}

module.exports = fetchDolarHoyQuote;
