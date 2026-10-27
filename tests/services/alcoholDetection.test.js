jest.mock('../../src/config/supabase', () => ({}));
const mockGenerateText = jest.fn();
jest.mock('../../src/services/shared/geminiService', () => ({generateText: (...args) => mockGenerateText(...args)}));
const alcoholDetectionService = require('../../src/services/shared/alcoholDetectionService');

// Las abreviaturas de combustible no son alcohol ni se consultan a la IA
test('la gasolina de surtidor no se marca como alcohol', async () => {
  mockGenerateText.mockClear();
  expect(await alcoholDetectionService.analyzeAlcohol([{nombre_producto: 'G.ESPECIAL+'}])).toBe(false);
  expect(await alcoholDetectionService.analyzeAlcohol([{nombre_producto: 'G.ESPECIAL+6,96'}, {nombre_producto: 'GASOLINA ESPECIAL'}])).toBe(false);
  expect(mockGenerateText).not.toHaveBeenCalled();
});

// Se comparan palabras completas: "ron" no coincide dentro de "patron" ni "copa" dentro de "copacabana"
test('compara palabras completas y no pedazos de otras palabras', () => {
  expect(alcoholDetectionService.containsAlcoholKeyword('Almuerzo en el Patrón Copacabana')).toBe(false);
  expect(alcoholDetectionService.containsAlcoholKeyword('Cerveza Paceña')).toBe(true);
  expect(alcoholDetectionService.containsAlcoholKeyword('2 copas de vino')).toBe(true);
});

// Una marca de cerveza se detecta aunque lleve una palabra inocua
test('detecta la cerveza Paceña Especial', async () => {
  expect(await alcoholDetectionService.analyzeAlcohol([{nombre_producto: 'PACEÑA ESPECIAL 620ML'}])).toBe(true);
});
