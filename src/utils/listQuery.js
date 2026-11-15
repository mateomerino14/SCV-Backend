const defaultPageSize = 15;
const maxPageSize = 100;
const maxSearchWords = 5;
const accentClasses = {a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]', n: '[nñ]'};

// Lee la pagina pedida: sin "page" la lista sale completa; con "page" sale de a "limit" filas (maximo 100)
const pageOf = (query) => {
  if (query.page === undefined) {
    return null;
  }
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxPageSize, Math.max(1, parseInt(query.limit, 10) || defaultPageSize));
  return {page, limit, from: (page - 1) * limit, to: page * limit - 1};
};

// Arma la expresion que busca una palabra sin importar mayusculas ni tildes; deja solo letras, numeros y @ . _ -
const wordPattern = (word) => word
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9@._-]/g, '')
  .split('')
  .map((letter) => {
    if (letter === '.') {
      return '[.]';
    }
    return accentClasses[letter] || letter;
  })
  .join('');

// Agrega a la consulta la busqueda: cada palabra debe aparecer en alguno de los campos
const applySearch = (query, search, fields) => {
  const words = String(search || '').trim().split(/\s+/).map(wordPattern).filter(Boolean).slice(0, maxSearchWords);
  return words.reduce((current, pattern) => current.or(fields.map((field) => `${field}.imatch."${pattern}"`).join(',')), query);
};

// Responde la lista completa o la pagina pedida con el total de filas que cumplen el filtro; una pagina pasada del final sale vacia
const sendList = (res, result, page) => {
  if (page && result.error?.code === 'PGRST103') {
    const total = parseInt((String(result.error.details || '').match(/only (\d+) rows/) || [])[1], 10) || 0;
    return res.json({items: [], total, page: page.page, limit: page.limit});
  }
  if (result.error) {
    return res.status(500).json({error: result.error.message});
  }
  if (!page) {
    return res.json(result.data || []);
  }
  return res.json({items: result.data || [], total: result.count || 0, page: page.page, limit: page.limit});
};

module.exports = {pageOf, applySearch, sendList};
