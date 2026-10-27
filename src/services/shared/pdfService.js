// En contenedores como Render, /dev/shm es pequeño y Chrome se cuelga si lo usa para las paginas
const chromeArgs = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  // Sin conexiones de fondo de Chrome (actualizaciones, sincronizacion), que no hacen falta para imprimir
  '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
  '--disable-default-apps', '--no-first-run', '--no-default-browser-check',
];

// Los documentos no cargan recursos externos: alcanza con esperar a que la pagina termine de cargar
const contentTimeoutMs = 30000;

const defaultOptions = {
  format: 'A4',
  landscape: true,
  margin: {top: '5mm', bottom: '5mm', left: '5mm', right: '5mm'},
  preferCSSPageSize: true,
};

// Carga Puppeteer (modulo ES) solo cuando se genera el primer PDF
const loadPuppeteer = async () => {
  const puppeteerModule = await import('puppeteer');
  return puppeteerModule.default;
};

// Genera un PDF desde HTML (A4 apaisado por defecto) y siempre cierra el navegador
const generatePdf = async (html, options = defaultOptions) => {
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    args: chromeArgs,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, {waitUntil: 'load', timeout: contentTimeoutMs});
    const pdf = await page.pdf(options);
    return Buffer.from(pdf);
  }
  finally {
    await browser.close();
  }
};

// Genera un PDF minimo y anota cuanto tardo, para comprobar que Chrome funciona en el servidor
const checkPdfGeneration = async () => {
  const startedAt = Date.now();
  try {
    const pdf = await generatePdf('<html><body><p>Prueba</p></body></html>');
    console.info(`[PDF] Prueba de arranque correcta: ${pdf.length} bytes en ${Date.now() - startedAt} ms`);
  }
  catch (error) {
    console.error(`[PDF] Prueba de arranque fallida tras ${Date.now() - startedAt} ms: ${error.message}`);
  }
};

module.exports = {generatePdf, checkPdfGeneration};
