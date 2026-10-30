const fs = require('fs');
const {buildRebuildSql, outputFile} = require('../../scripts/buildRebuildSql');

// El archivo para Supabase debe estar al dia con los scripts de origen
test('reconstruir_base_completa.sql está al día con los scripts', () => {
  expect(fs.readFileSync(outputFile, 'utf8')).toBe(buildRebuildSql());
});
