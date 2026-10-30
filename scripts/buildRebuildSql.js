// Arma database/reconstruir_base_completa.sql uniendo los scripts en orden, para pegarlo de una vez en Supabase (npm run db:reconstruccion)
const fs = require('fs');
const path = require('path');

const databaseDir = path.join(__dirname, '..', 'database');
const outputFile = path.join(databaseDir, 'reconstruir_base_completa.sql');
const parts = ['mantenimiento/borrar_todo.sql', '01_esquema.sql', '02_funciones.sql', '03_datos_iniciales.sql', '04_seguridad_rls.sql', '05_demo_usuarios_ficticios.sql'];
const header = `-- ============================================================
-- SCV · RECONSTRUIR LA BASE COMPLETA
-- ============================================================
-- Borra todo y crea la base de nuevo con la demo de usuarios ficticios. Contraseña de todos: Viaticos2026
-- Archivo generado con npm run db:reconstruccion a partir de: ${parts.join(', ')}
-- No se edita a mano: se cambian los scripts de origen y se vuelve a generar.
-- ADVERTENCIA: no se puede deshacer. Nunca en una base con datos reales.
-- ============================================================
`;

// Devuelve el contenido del archivo completo, con cada script separado por su nombre
const buildRebuildSql = () => {
  const sections = parts.map((part) => `\n-- >>>>> ${part}\n\n${fs.readFileSync(path.join(databaseDir, part), 'utf8').trim()}\n`);
  return `${header}${sections.join('')}`;
};

if (require.main === module) {
  fs.writeFileSync(outputFile, buildRebuildSql());
  console.log(`Generado ${path.relative(process.cwd(), outputFile)}`);
}

module.exports = {buildRebuildSql, outputFile};
