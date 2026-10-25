const mockRemove = jest.fn(() => Promise.resolve({error: null}));
jest.mock('../../src/config/supabase', () => ({storage: {from: () => ({remove: mockRemove})}}));
const {getStoragePath, removeFiles} = require('../../src/services/shared/storageService');

const publicUrl = (path) => `https://abc.supabase.co/storage/v1/object/public/facturas/${path}`;

// La ruta se saca de la URL publica del bucket; otras URLs se ignoran
test('obtiene la ruta del archivo desde su URL pública', () => {
  expect(getStoragePath(publicUrl('gastos/1_ab.jpg'))).toBe('gastos/1_ab.jpg');
  expect(getStoragePath(publicUrl('perfiles/3_1%20b.png?v=2'))).toBe('perfiles/3_1 b.png');
  expect(getStoragePath('https://otro.sitio/imagen.png')).toBeNull();
  expect(getStoragePath(null)).toBeNull();
});

// Solo pide borrar las rutas validas y no llama al almacenamiento si no hay ninguna
test('borra solo los archivos del bucket', async () => {
  await removeFiles([publicUrl('gastos/1.jpg'), null, 'https://otro.sitio/x.png', publicUrl('facturas/2.png')]);
  expect(mockRemove).toHaveBeenCalledWith(['gastos/1.jpg', 'facturas/2.png']);
  mockRemove.mockClear();
  await removeFiles([null, undefined]);
  expect(mockRemove).not.toHaveBeenCalled();
});
