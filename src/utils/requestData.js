// Lee el campo datos (JSON) de un formulario multiparte; devuelve null si no es valido
const parseFormData = (rawValue) => {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  }
  catch (error) {
    return null;
  }
};

module.exports = {parseFormData};
