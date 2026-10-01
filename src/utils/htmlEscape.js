// Escapa un texto para insertarlo en HTML (correos y PDF) sin que se interprete como
// etiquetas: evita que un texto escrito por el usuario altere o falsifique el documento
const escapeHtml = (value) => {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Devuelve una copia con todos los textos escapados (objetos y listas anidados); numeros,
// booleanos y null se conservan. Se usa al entrar a una plantilla con datos de la base.
const escapeDeep = (value) => {
  if (typeof value === 'string') {
    return escapeHtml(value)
  }
  if (Array.isArray(value)) {
    return value.map(escapeDeep)
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeDeep(item)]))
  }
  return value
}

module.exports = {escapeHtml, escapeDeep}
