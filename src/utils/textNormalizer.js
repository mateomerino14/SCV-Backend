// Normaliza un texto quitando acentos y caracteres especiales
const normalizeText = (text) => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
};

// Acorta un texto largo (como el motivo del viaje) para asuntos de correo
const shortenText = (text, maxLength = 60) => {
  const value = String(text || '').trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

module.exports = {normalizeText, shortenText};