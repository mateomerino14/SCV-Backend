const htmlPdf = require('html-pdf-node')

// Genera un PDF en formato A4 a partir de un contenido HTML
const generatePdf = async (html) => {
  const file = {content: html}
  const options = {format: 'A4', margin: {top: '10mm', bottom: '10mm', left: '10mm', right: '10mm'}}
  return await htmlPdf.generatePdf(file, options)
};

module.exports = {generatePdf};