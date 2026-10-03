// Escapa un texto para insertarlo en HTML (correos y PDF) sin que se interprete como etiquetas
const escapeHtml = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Devuelve una copia con todos los textos escapados, incluidos objetos y listas anidados
const escapeDeep = (value) => {
  if (typeof value === 'string') {
    return escapeHtml(value);
  }
  if (Array.isArray(value)) {
    return value.map(escapeDeep);
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeDeep(item)]));
  }
  return value;
};

module.exports = {escapeHtml, escapeDeep};
