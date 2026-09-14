const htmlPdf = require('html-pdf-node')

const defaultOptions = {
  format: 'A4',
  landscape: true,
  margin: {top: '5mm', bottom: '5mm', left: '5mm', right: '5mm'},
  preferCSSPageSize: true,
}

// Genera un PDF a partir de un contenido HTML; por defecto usa A4 apaisado
const generatePdf = async (html, options = defaultOptions) => {
  const file = {content: html}
  return await htmlPdf.generatePdf(file, options)
};

module.exports = {generatePdf};