const supplierService = require('../../src/services/expense/supplierService')

// Verifica que detecte un NIT valido por longitud
test('detecta NIT cuando tiene 9 o mas digitos', () => {
  const result = supplierService.detectTaxDocType('123456789')
  expect(result).toBe('NIT')
})

// Verifica que detecte una CI por longitud corta
test('detecta CI cuando tiene menos de 9 digitos', () => {
  const result = supplierService.detectTaxDocType('1234567')
  expect(result).toBe('CI')
})

// Verifica que retorne null cuando no hay documento
test('retorna null cuando no se proporciona documento', () => {
  const result = supplierService.detectTaxDocType(null)
  expect(result).toBe(null)
})

// Verifica que retorne null para el valor especial No Especificado
test('retorna null para el valor No Especificado', () => {
  const result = supplierService.detectTaxDocType('No Especificado')
  expect(result).toBe(null)
})

// Verifica que ignore guiones y espacios al contar digitos
test('ignora guiones y espacios al validar', () => {
  const result = supplierService.detectTaxDocType('123-456-789')
  expect(result).toBe('NIT')
})