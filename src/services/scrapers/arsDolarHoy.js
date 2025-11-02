const http = require('../../utils/httpClient');
const { parsePrice } = require('../../utils/parsing');

const SOURCE = 'dolarhoy';
const SOURCE_URL = 'https://www.dolarhoy.com/cotizaciondolaroficial';
const API_URL = 'https://dolarhoy.com/api/dolaroficial';

async function fetchDolarHoyQuote() {
  const { data } = await http.get(API_URL);

  const buy = parsePrice(data?.compra);
  const sell = parsePrice(data?.venta);

  if (Number.isNaN(buy) || Number.isNaN(sell)) {
    throw new Error('Unable to parse DolarHoy quote');
  }

  return {
    currency: 'ARS',
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    buy,
    sell
  };
}

module.exports = fetchDolarHoyQuote;
