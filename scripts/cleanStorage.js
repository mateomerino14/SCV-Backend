// Borra del almacenamiento los archivos que ya no usa ningun gasto, usuario ni documento emitido (npm run limpiar-archivos; con -- --prueba solo los lista)
require('dotenv').config();
const supabase = require('../src/config/supabase');
const storageService = require('../src/services/shared/storageService');
const storedPdfService = require('../src/services/shared/storedPdfService');

const dryRun = process.argv.includes('--prueba');
const folders = ['gastos', 'facturas', 'perfiles'];
const documentFolders = ['planilla_rendicion', 'recibo'];
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

// Lista todos los archivos de una carpeta de un bucket
const listFolder = async (bucket, folder) => {
  const files = [];
  for (let offset = 0; ; offset += pageSize) {
    const {data, error} = await supabase.storage.from(bucket).list(folder, {limit: pageSize, offset});
    if (error) {
      throw new Error(`No se pudo listar la carpeta ${folder}: ${error.message}`);
    }
    files.push(...data.filter((file) => file.id).map((file) => ({path: `${folder}/${file.name}`, createdAt: file.created_at})));
    if (data.length < pageSize) {
      return files;
    }
  }
};

// Archivos de las carpetas de un bucket que no estan en uso; los de menos de un dia se dejan porque pueden estar guardandose
const unusedFiles = async (bucket, bucketFolders, usedPaths) => {
  const now = Date.now();
  const unused = [];
  for (const folder of bucketFolders) {
    const files = await listFolder(bucket, folder);
    unused.push(...files.filter((file) => !usedPaths.has(file.path) && now - new Date(file.createdAt).getTime() > minimumAgeMs));
  }
  return unused;
};

// Borra los archivos de un bucket de a 100
const removePaths = async (bucket, paths) => {
  for (let index = 0; index < paths.length; index += 100) {
    const {error} = await supabase.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) {
      throw new Error(`No se pudieron borrar los archivos de ${bucket}: ${error.message}`);
    }
  }
};

// Compara los archivos de los buckets con los que estan en uso y borra (o lista) los sobrantes: fotos sin gasto ni usuario y PDF guardados de documentos que ya no existen
const run = async () => {
  const usedUrls = [
    ...await readAllValues('Imagen', 'url_archivo'),
    ...await readAllValues('Imagen_Respaldo', 'url_archivo'),
    ...await readAllValues('Usuario', 'foto_perfil'),
  ];
  const usedPaths = new Set(usedUrls.map(storageService.getStoragePath).filter(Boolean));
  const usedDocuments = new Set(await readAllValues('Documento_Emitido', 'ruta_archivo'));
  const unused = await unusedFiles(storageService.bucket, folders, usedPaths);
  const unusedDocuments = await unusedFiles(storedPdfService.bucket, documentFolders, usedDocuments);
  console.log(`Archivos en uso: ${usedPaths.size}. Archivos sin usar: ${unused.length}.`);
  unused.forEach((file) => console.log(`  ${file.path}`));
  console.log(`PDF guardados en uso: ${usedDocuments.size}. PDF sin documento: ${unusedDocuments.length}.`);
  unusedDocuments.forEach((file) => console.log(`  ${storedPdfService.bucket}/${file.path}`));
  if (dryRun) {
    return;
  }
  await removePaths(storageService.bucket, unused.map((file) => file.path));
  await removePaths(storedPdfService.bucket, unusedDocuments.map((file) => file.path));
  console.log(`Se borraron ${unused.length + unusedDocuments.length} archivos.`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
