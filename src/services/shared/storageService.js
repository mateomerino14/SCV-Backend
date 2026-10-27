const supabase = require('../../config/supabase');

const bucket = 'facturas';
const publicMarker = `/storage/v1/object/public/${bucket}/`;

// Sube un archivo a la carpeta indicada y devuelve su URL publica
const uploadFile = async (folder, file, prefix = '') => {
  const fileExtension = file.originalname.split('.').pop();
  const fileName = `${folder}/${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExtension}`;
  const {error} = await supabase.storage.from(bucket).upload(fileName, file.buffer, {contentType: file.mimetype});
  if (error) {
    return {error: error.message};
  }
  return {url: supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl};
};

// Ruta del archivo dentro del bucket a partir de su URL publica, o null si no es de este bucket
const getStoragePath = (url) => {
  const text = String(url || '');
  const index = text.indexOf(publicMarker);
  if (index === -1) {
    return null;
  }
  return decodeURIComponent(text.slice(index + publicMarker.length).split('?')[0]);
};

// Borra del almacenamiento los archivos de esas URLs; si falla solo lo avisa, para no cortar la operacion
const removeFiles = async (urls) => {
  const paths = (urls || []).map(getStoragePath).filter(Boolean);
  if (paths.length === 0) {
    return;
  }
  const {error} = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    console.warn('No se pudieron borrar archivos del almacenamiento:', error.message);
  }
};

module.exports = {bucket, uploadFile, getStoragePath, removeFiles};
