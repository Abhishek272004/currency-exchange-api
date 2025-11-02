function parsePrice(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (!value) {
    return NaN;
  }

  const normalized = String(value)
    .trim()
    .replace(/[^0-9.,-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');

  return Number(normalized);
}

module.exports = {
  parsePrice
};
