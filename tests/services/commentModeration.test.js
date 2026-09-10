const commentModerationService = require('../../src/services/shared/commentModerationService')

// Verifica que detecte una palabra prohibida exacta
test('detecta una palabra prohibida', () => {
  const result = commentModerationService.containsForbiddenWords('eres un idiota')
  expect(result).toBe(true)
})

// Verifica que no marque texto limpio como prohibido
test('no marca texto normal como inapropiado', () => {
  const result = commentModerationService.containsForbiddenWords('el gasto fue registrado correctamente')
  expect(result).toBe(false)
})

// Verifica que detecte palabras prohibidas con acentos
test('detecta palabras prohibidas sin importar acentos', () => {
  const result = commentModerationService.containsForbiddenWords('que hipócrita eres')
  expect(result).toBe(true)
})

// Verifica que ignore la puntuacion al evaluar
test('ignora signos de puntuacion al evaluar', () => {
  const result = commentModerationService.containsForbiddenWords('idiota, revisa esto.')
  expect(result).toBe(true)
})