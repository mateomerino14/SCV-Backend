// Lee el campo "datos" (JSON) de un formulario multiparte. Devuelve null si falta o no es
// un JSON valido, para responder 400 en vez de un error interno
const parseFormData = (rawValue) => {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null
  }
  try {
    const parsed = JSON.parse(rawValue)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  }
  catch (error) {
    return null
  }
}

module.exports = {parseFormData}
