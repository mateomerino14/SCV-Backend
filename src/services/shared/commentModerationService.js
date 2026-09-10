const forbiddenWords = require('../../utils/forbiddenWords')
const textNormalizer = require('../../utils/textNormalizer')

// Verifica si un texto contiene alguna palabra prohibida
const containsForbiddenWords = (text) => {
  const cleanText = textNormalizer.normalizeText(text).replace(/[.,!?;:]/g, '')
  const words = cleanText.split(' ')
  for (const word of words) {
    if (forbiddenWords.includes(word)) {
      return true
    }
  }
  return false
};

module.exports = {containsForbiddenWords};