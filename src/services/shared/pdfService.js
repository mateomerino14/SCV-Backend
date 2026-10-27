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
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, {waitUntil: 'networkidle0', timeout: 60000});
    const pdf = await page.pdf(options);
    return Buffer.from(pdf);
  }
  finally {
    await browser.close();
  }
};

module.exports = {generatePdf};
