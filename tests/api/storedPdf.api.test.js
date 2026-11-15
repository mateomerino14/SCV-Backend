// Jest no puede abrir Puppeteer: el PDF de prueba lleva el HTML para comparar lo que se genero
jest.mock('../../src/services/shared/pdfService', () => ({
  generatePdf: jest.fn(async (html) => Buffer.from(`%PDF-prueba ${html.length} ${html.slice(-400)}`)),
}));

const {login, api, boliviaDate} = require('./helpers');
const pdfService = require('../../src/services/shared/pdfService');
const supabase = require('../../src/config/supabase');

jest.setTimeout(180000);

let employee;
let tripId;

// Junta el cuerpo de la respuesta como bytes, para comparar los PDF
const binaryParser = (response, callback) => {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

// Descarga la planilla del viaje en PDF
const downloadStatement = () => employee.get(`/trip/${tripId}/rendicion-pdf`).buffer(true).parse(binaryParser);

// Documentos de la planilla emitidos para el viaje
const statementSeals = async () => (await supabase.from('Documento_Emitido').select('codigo, huella, ruta_archivo').eq('id_viaje', tripId).eq('tipo', 'PLANILLA_RENDICION')).data;

beforeAll(async () => {
  employee = api(await login('juan.empleado'));
  const created = await employee.post('/trip', {
    motivo: 'Viaje para la planilla guardada', origen: 'La Paz', destino: 'Potosí', fecha_inicio: boliviaDate(-1), fecha_fin: boliviaDate(1),
    tipo: 'Nacional', transporte: 'Terrestre', monto_asignado: 690,
  });
  tripId = created.body.id_viaje;
  await supabase.from('Viaje').update({estado: 'EN_CURSO', fue_iniciado: true}).eq('id_viaje', tripId);
  await employee.postForm('/expense/register', {id_viaje: tripId, monto_total: 50, fecha_gasto: boliviaDate(), tipo: 'C', descripcion: 'Compra de material', id_categoria_gasto: 1, es_gasto_internacional: false});
  await supabase.from('Viaje').update({estado: 'APROBADO_FINAL'}).eq('id_viaje', tripId);
});

// La planilla se genera una vez y las descargas siguientes entregan el mismo PDF con el mismo codigo; si cambia un dato, se genera de nuevo
test('reutiliza la planilla en PDF mientras los datos no cambien', async () => {
  const first = await downloadStatement();
  expect(first.status).toBe(200);
  expect(first.body.slice(0, 4).toString()).toBe('%PDF');
  expect(pdfService.generatePdf).toHaveBeenCalledTimes(1);
  let seals = await statementSeals();
  expect(seals).toHaveLength(1);
  expect(seals[0].huella).toHaveLength(64);
  expect(seals[0].ruta_archivo).toBe(`planilla_rendicion/${seals[0].codigo}.pdf`);
  const second = await downloadStatement();
  expect(Buffer.compare(first.body, second.body)).toBe(0);
  expect(await statementSeals()).toHaveLength(1);
  expect(pdfService.generatePdf).toHaveBeenCalledTimes(1);
  await supabase.from('Gasto').update({descripcion: 'Compra de material corregida'}).eq('id_viaje', tripId);
  const third = await downloadStatement();
  expect(third.status).toBe(200);
  expect(Buffer.compare(first.body, third.body)).not.toBe(0);
  expect(pdfService.generatePdf).toHaveBeenCalledTimes(2);
  seals = await statementSeals();
  expect(seals).toHaveLength(2);
  expect(seals[0].huella).not.toBe(seals[1].huella);
});
