// Deja el CUF (codigo de autorizacion) solo con letras y numeros en mayusculas, o null si no vino
const normalizeCuf = (value) => {
  const cuf = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 100);
  if (!cuf || cuf === 'NOESPECIFICADO' || cuf === 'NULL') {
    return null;
  }
  return cuf;
};

module.exports = {normalizeCuf};
