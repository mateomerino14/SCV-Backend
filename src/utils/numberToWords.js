const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const specialTens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const tens = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

// Convierte un numero de hasta tres cifras a su representacion en letras
const convertGroup = (number) => {
  if (number === 0) {
    return ''
  }
  if (number === 100) {
    return 'CIEN'
  }
  let result = ''
  const hundredDigit = Math.floor(number / 100)
  const remainder = number % 100
  if (hundredDigit > 0) {
    result += hundreds[hundredDigit] + ' '
  }
  if (remainder >= 10 && remainder <= 19) {
    result += specialTens[remainder - 10]
  }
  else {
    const tenDigit = Math.floor(remainder / 10)
    const unitDigit = remainder % 10
    if (tenDigit === 2 && unitDigit > 0) {
      result += 'VEINTI' + units[unitDigit]
    }
    else {
      if (tenDigit > 0) {
        result += tens[tenDigit]
      }
      if (tenDigit > 0 && unitDigit > 0) {
        result += ' Y '
      }
      if (unitDigit > 0) {
        result += units[unitDigit]
      }
    }
  }
  return result.trim()
};

// Convierte un numero a su representacion en letras junto con el nombre de la moneda
const convertNumberToWords = (number, currency = 'BOLIVIANOS') => {
  const integerPart = Math.floor(number)
  const cents = Math.round((number - integerPart) * 100)
  if (integerPart === 0) {
    return `CERO 00/100 ${currency}`
  }
  let result = ''
  const millions = Math.floor(integerPart / 1000000)
  const thousands = Math.floor((integerPart % 1000000) / 1000)
  const remainder = integerPart % 1000
  if (millions > 0) {
    if (millions === 1) {
      result += 'UN MILLÓN '
    }
    else {
      result += convertGroup(millions) + ' MILLONES '
    }
  }
  if (thousands > 0) {
    if (thousands === 1) {
      result += 'MIL '
    }
    else {
      result += convertGroup(thousands) + ' MIL '
    }
  }
  if (remainder > 0) {
    result += convertGroup(remainder)
  }
  result = result.trim()
  const centsStr = cents.toString().padStart(2, '0')
  return `${result} ${centsStr}/100 ${currency}`
};

module.exports = {convertNumberToWords};