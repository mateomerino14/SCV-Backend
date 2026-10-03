// Lee el campo datos (JSON) de un formulario multiparte; devuelve null si no es valido
const parseFormData = (rawValue) => {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  }
  catch (error) {
    return null;
  }
};

module.exports = {parseFormData};
