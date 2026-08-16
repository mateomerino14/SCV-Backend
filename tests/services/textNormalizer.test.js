const textNormalizer = require('../../src/utils/textNormalizer')

// Verifica que quite acentos correctamente
test('quita acentos de vocales', () => {
  const result = textNormalizer.normalizeText('café mañana')
  expect(result).toBe('cafe manana')
})

// Verifica que convierta a minusculas
test('convierte a minusculas', () => {
  const result = textNormalizer.normalizeText('HOLA MUNDO')
  expect(result).toBe('hola mundo')
})

// Verifica que quite caracteres especiales
test('quita caracteres especiales', () => {
  const result = textNormalizer.normalizeText('precio: $100.50!')
  expect(result).toBe('precio   100 50')
})

// Verifica que recorte espacios al inicio y final
test('recorta espacios sobrantes', () => {
  const result = textNormalizer.normalizeText('  texto con espacios  ')
  expect(result).toBe('texto con espacios')
})