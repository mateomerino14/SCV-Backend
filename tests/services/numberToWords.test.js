const numberToWords = require('../../src/utils/numberToWords')

// Verifica la conversion de un numero simple
test('convierte un numero de dos digitos', () => {
  const result = numberToWords.convertNumberToWords(25, 'BOLIVIANOS')
  expect(result).toBe('VEINTICINCO 00/100 BOLIVIANOS')
})

// Verifica la conversion de cien exacto
test('convierte cien correctamente', () => {
  const result = numberToWords.convertNumberToWords(100, 'BOLIVIANOS')
  expect(result).toBe('CIEN 00/100 BOLIVIANOS')
})

// Verifica la conversion con centavos
test('incluye los centavos en el resultado', () => {
  const result = numberToWords.convertNumberToWords(150.75, 'BOLIVIANOS')
  expect(result).toBe('CIENTO CINCUENTA 75/100 BOLIVIANOS')
})

// Verifica la conversion de miles
test('convierte miles correctamente', () => {
  const result = numberToWords.convertNumberToWords(1500, 'BOLIVIANOS')
  expect(result).toBe('MIL QUINIENTOS 00/100 BOLIVIANOS')
})

// Verifica el caso especial de cero
test('maneja el caso de cero', () => {
  const result = numberToWords.convertNumberToWords(0, 'BOLIVIANOS')
  expect(result).toBe('CERO 00/100 BOLIVIANOS')
})

// Verifica que use la moneda indicada
test('usa la moneda proporcionada', () => {
  const result = numberToWords.convertNumberToWords(50, 'DÓLARES AMERICANOS')
  expect(result).toBe('CINCUENTA 00/100 DÓLARES AMERICANOS')
})