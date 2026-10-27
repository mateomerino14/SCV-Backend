// Borra del almacenamiento los archivos que ya no usa ningun gasto ni usuario (npm run limpiar-archivos; con -- --prueba solo los lista)
require('dotenv').config();
const supabase = require('../src/config/supabase');
const storageService = require('../src/services/shared/storageService');

const dryRun = process.argv.includes('--prueba');
const folders = ['gastos', 'facturas', 'perfiles'];
const pageSize = 1000;
const minimumAgeMs = 24 * 60 * 60 * 1000;

// Lee todas las filas de una columna, de a paginas, porque la consulta devuelve como maximo 1000
const readAllValues = async (table, column) => {
  const values = [];
  for (let from = 0; ; from += pageSize) {
    const {data, error} = await supabase.from(table).select(column).not(column, 'is', null).range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`No se pudo leer ${table}: ${error.message}`);
    }
    values.push(...data.map((row) => row[column]));
    if (data.length < pageSize) {
      return values;
    }
  }
};

// Lista todos los archivos de una carpeta del bucket
const listFolder = async (folder) => {
  const files = [];
  for (let offset = 0; ; offset += pageSize) {
    const {data, error} = await supabase.storage.from(storageService.bucket).list(folder, {limit: pageSize, offset});
    if (error) {
      throw new Error(`No se pudo listar la carpeta ${folder}: ${error.message}`);
    }
    files.push(...data.filter((file) => file.id).map((file) => ({path: `${folder}/${file.name}`, createdAt: file.created_at})));
    if (data.length < pageSize) {
      return files;
    }
  }
};

// Compara los archivos del bucket con los que estan en uso y borra (o lista) los sobrantes
const run = async () => {
  const usedUrls = [
    ...await readAllValues('Imagen', 'url_archivo'),
    ...await readAllValues('Imagen_Respaldo', 'url_archivo'),
    ...await readAllValues('Usuario', 'foto_perfil'),
  ];
  const usedPaths = new Set(usedUrls.map(storageService.getStoragePath).filter(Boolean));
  const now = Date.now();
  const unused = [];
  for (const folder of folders) {
    const files = await listFolder(folder);
    // Los de menos de un dia se dejan: pueden ser de un gasto que se esta guardando en este momento
    unused.push(...files.filter((file) => !usedPaths.has(file.path) && now - new Date(file.createdAt).getTime() > minimumAgeMs));
  }
  console.log(`Archivos en uso: ${usedPaths.size}. Archivos sin usar: ${unused.length}.`);
  unused.forEach((file) => console.log(`  ${file.path}`));
  if (dryRun || unused.length === 0) {
    return;
  }
  const paths = unused.map((file) => file.path);
  for (let index = 0; index < paths.length; index += 100) {
    const {error} = await supabase.storage.from(storageService.bucket).remove(paths.slice(index, index + 100));
    if (error) {
      throw new Error(`No se pudieron borrar los archivos: ${error.message}`);
    }
  }
  console.log(`Se borraron ${paths.length} archivos.`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
