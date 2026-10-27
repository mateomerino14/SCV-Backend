const {join} = require('path');

// Chrome se descarga dentro del proyecto para que Render lo conserve entre la compilacion y la ejecucion
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
