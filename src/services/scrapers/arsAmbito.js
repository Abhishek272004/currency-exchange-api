const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE = 'Ambito';
const SOURCE_URL = 'https://www.ambito.com/contenidos/dolar.html';

// Helper function to parse price text
function parsePriceText(text) {
  if (!text) return null;
  // Remove currency symbols, spaces, and replace comma with dot
  const numberStr = text
    .replace(/[^\d,]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(numberStr) || null;
}

async function fetchAmbitoQuote() {
  try {
    // Try the main website first
    const { data } = await axios.get(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    
    // Try different selectors to find the rates
    const rateSelectors = [
      // First try data-testid selectors
      () => {
        const buyText = $('[data-testid="dolar-venta"]').text().trim();
        const sellText = $('[data-testid="dolar-compra"]').text().trim();
        return { buy: buyText, sell: sellText };
      },
      // Try class-based selectors
      () => {
        const buyText = $('.dolar-value-compra').first().text().trim();
        const sellText = $('.dolar-value-venta').first().text().trim();
        return { buy: buyText, sell: sellText };
      },
      // Try to find any numbers that look like exchange rates
      () => {
        const rateElements = $('p, span, div, td').filter((i, el) => {
          const text = $(el).text().trim();
          return /[0-9]+[.,][0-9]+/.test(text) && 
                 (text.includes('compra') || text.includes('venta') || 
                  text.includes('buy') || text.includes('sell'));
        });
        
        const rates = [];
        rateElements.each((i, el) => {
          const text = $(el).text().trim();
          const match = text.match(/([0-9]+[.,][0-9]+)/);
          if (match) {
            rates.push(parsePriceText(match[0]));
          }
        });
        
        if (rates.length >= 2) {
          return { buy: rates[0], sell: rates[1] };
        }
        return { buy: '', sell: '' };
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
      sell = buy * 1.02; // 2% spread
    } else if (sell && !buy) {
      buy = sell / 1.02; // 2% spread
    } else if (!buy && !sell) {
      throw new Error('Could not find exchange rates on Ambito page');
    }
    
    return {
      currency: 'ARS',
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      buy: parseFloat(buy.toFixed(4)),
      sell: parseFloat(sell.toFixed(4)),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching from Ambito:', error.message);
    // Fallback to a reasonable rate if all methods fail
    return {
      currency: 'ARS',
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      buy: 900.00,
      sell: 920.00,
      timestamp: new Date().toISOString(),
      is_fallback: true,
      error: error.message
    };
  }
}

module.exports = fetchAmbitoQuote;
