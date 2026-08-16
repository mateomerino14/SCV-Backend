const express = require('express')
const router = express.Router()
const supabase = require('../config/supabase')
const authMiddleware = require('../middlewares/auth')
const multer = require('multer')
const FormData = require('form-data')
const axios = require('axios')
const cheerio = require('cheerio')
const Groq = require('groq-sdk')
const Jimp = require('jimp')
const QrCode = require('qrcode-reader')
const { actualizarAlcoholEnViaje } = require('../utils/alcoholUtils')
const { validarPlazoViaje } = require('../utils/tolerancia')

const upload = multer({ storage: multer.memoryStorage() })
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const IVA_PORCENTAJE_BOLIVIA = 13

const detectarTipoDoc = (nit) => {
  if (!nit || nit === 'No Especificado') return null
  const soloNumeros = nit.replace(/[-.\s]/g, '')
  if (/^[0-9]+$/.test(soloNumeros)) {
    if (soloNumeros.length >= 9) return 'NIT'
    return 'CI'
  }
  return 'NIT'
}

const leerQRDesdeBuffer = async (buffer) => {
  try {
    const imagen = await Jimp.read(buffer)
    const qr = new QrCode()
    return await new Promise((resolve) => {
      qr.callback = (err, value) => {
        if (err || !value?.result) resolve(null)
        else resolve(value.result)
      }
      qr.decode(imagen.bitmap)
    })
  } catch {
    return null
  }
}

const limpiarTexto = (t) => (t || '').replace(/\s+/g, ' ').trim()

const obtenerDatosDesdeQRSiat = async (urlQR) => {
  try {
    const { data: html } = await axios.get(urlQR, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    })
    const $ = cheerio.load(html)

    const pares = {}
    $('table tr').each((_, tr) => {
      const celdas = $(tr).find('td, th')
      if (celdas.length === 2) {
        const label = limpiarTexto($(celdas[0]).text())
        const valor = limpiarTexto($(celdas[1]).text())
        if (label && label.endsWith(':')) {
          pares[label.replace(':', '').toLowerCase()] = valor
        }
      }
    })

    const numeroFactura = pares['número de factura'] || pares['numero de factura'] || null
    const cuf = pares['cuf'] || null
    const fechaEmisionRaw = pares['fecha emisión'] || pares['fecha emision'] || null
    const montoTotalRaw = pares['monto total'] || null
    const nitEmisor = pares['nit emisor'] || null
    const razonSocial = pares['razón social'] || pares['razon social'] || null

    let fechaEmision = ''
    if (fechaEmisionRaw) {
      const soloFecha = fechaEmisionRaw.split(' ')[0]
      const [d, m, y] = soloFecha.split('/')
      if (d && m && y) fechaEmision = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }

    const montoTotal = montoTotalRaw ? parseFloat(montoTotalRaw.replace(/[^\d.]/g, '')) || 0 : 0

    const detalle = []
    $('table').each((_, table) => {
      const headerTxt = limpiarTexto($(table).find('tr').first().text()).toLowerCase()
      if (headerTxt.includes('código') || headerTxt.includes('codigo')) {
        $(table).find('tr').slice(1).each((_, tr) => {
          const celdas = $(tr).find('td')
          if (celdas.length >= 5) {
            const nombre_producto = limpiarTexto($(celdas[1]).text())
            const cantidad = parseFloat(limpiarTexto($(celdas[2]).text()).replace(',', '.')) || 1
            const precioTxt = limpiarTexto($(celdas[3]).text())
            const precio = parseFloat(precioTxt.replace(/[^\d.]/g, '')) || 0
            if (nombre_producto) detalle.push({ nombre_producto, cantidad, precio })
          }
        })
      }
    })

    if (!numeroFactura && !cuf && detalle.length === 0) return null

    return {
      proveedor: razonSocial || 'No Especificado',
      numero_factura: numeroFactura || 'No Especificado',
      nit: nitEmisor || null,
      fecha_emision: fechaEmision,
      iva: 0,
      monto: montoTotal,
      monto_total: montoTotal,
      tipo_doc: 'F',
      detalle,
      extraido_por_qr: true,
    }
  } catch (e) {
    console.warn('Error consultando QR SIAT:', e.message)
    return null
  }
}

const parsearQRSIAT = (qrText) => {
  try {
    let params = {}

    if (qrText.includes('http')) {
      const url = new URL(qrText)
      params = Object.fromEntries(url.searchParams.entries())
    } else if (qrText.includes('|')) {
      const partes = qrText.split('|')
      if (partes.length >= 4) {
        params = {
          nit: partes[0],
          numeroFactura: partes[1],
          fechaEmision: partes[2],
          montoTotal: partes[3],
          codigoControl: partes[4] || '',
        }
      }
    } else {
      return null
    }

    let fechaNormalizada = params.fechaEmision || params.fechaFactura || ''
    if (fechaNormalizada.includes('/')) {
      const [d, m, y] = fechaNormalizada.split('/')
      fechaNormalizada = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }

    const nit = params.nit || params.nitEmisor || null
    const numeroFactura = params.numeroFactura || params.nroFactura || null
    const montoTotal = parseFloat(params.montoTotal || params.monto || 0)

    if (!nit && !numeroFactura && !montoTotal) return null

    return {
      nit: nit?.toString() || null,
      numero_factura: numeroFactura?.toString() || 'No Especificado',
      fecha_emision: fechaNormalizada || '',
      monto_total: montoTotal,
      monto: montoTotal,
      iva: 0,
      proveedor: 'No Especificado',
      tipo_doc: 'F',
      detalle: [],
      extraido_por_qr: true,
    }
  } catch {
    return null
  }
}

router.post('/extraer', authMiddleware, upload.single('factura'), async (req, res) => {
  try {
    const qrTexto = await leerQRDesdeBuffer(req.file.buffer)

    if (qrTexto) {
      let datosQR = null

      if (qrTexto.includes('siat.impuestos.gob.bo')) {
        datosQR = await obtenerDatosDesdeQRSiat(qrTexto)
      }

      if (!datosQR) {
        datosQR = parsearQRSIAT(qrTexto)
      }

      if (datosQR) {
        return res.json({
          proveedor: datosQR.proveedor,
          numero_factura: datosQR.numero_factura,
          nit: datosQR.nit,
          fecha_emision: datosQR.fecha_emision,
          iva: datosQR.iva,
          monto: datosQR.monto,
          monto_total: datosQR.monto_total,
          tipo_doc: datosQR.tipo_doc,
          detalle: datosQR.detalle,
          extraido_por_qr: true,
        })
      }
    }

    const formData = new FormData()
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    })
    formData.append('language', 'spa')
    formData.append('isOverlayRequired', 'false')
    formData.append('OCREngine', '2')

    const ocrResponse = await axios.post('https://api.ocr.space/parse/image', formData, {
      headers: { ...formData.getHeaders(), apikey: process.env.OCR_SPACE_API_KEY },
    })

    const texto = ocrResponse.data?.ParsedResults?.[0]?.ParsedText || ''

    const chatResponse = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Analiza este texto extraído de una factura y devuelve SOLO un JSON sin texto adicional ni backticks con esta estructura exacta:
{
  "proveedor": "nombre del proveedor o empresa emisora",
  "numero_factura": "número de factura",
  "nit": "NIT o CI del proveedor (solo números, máximo 10 dígitos)",
  "fecha_emision": "fecha en formato YYYY-MM-DD",
  "iva": monto_numerico_del_impuesto_en_dinero_NO_el_porcentaje,
  "monto": monto_numerico_sin_impuestos,
  "monto_total": monto_numerico_total_con_impuestos,
  "tipo_doc": "F si tiene IVA o impuesto, R si es recibo sin impuesto",
  "detalle": [
    { "nombre_producto": "descripcion del producto", "cantidad": numero, "precio": numero_decimal }
  ]
}

IMPORTANTE: El campo iva debe ser el MONTO EN DINERO del impuesto, no el porcentaje.

Texto de la factura:
${texto}`
      }]
    })

    const respuesta = chatResponse.choices[0]?.message?.content?.trim() || ''
    const datos = JSON.parse(respuesta)

    return res.json({
      proveedor: datos.proveedor || 'No Especificado',
      numero_factura: datos.numero_factura || 'No Especificado',
      nit: datos.nit || null,
      fecha_emision: datos.fecha_emision || '',
      iva: datos.iva || 0,
      monto: datos.monto || 0,
      monto_total: datos.monto_total || 0,
      tipo_doc: datos.tipo_doc || 'F',
      detalle: datos.detalle || [],
      extraido_por_qr: false,
    })
  } catch (error) {
    console.log('Error extrayendo factura:', error)
    return res.status(500).json({ error: 'Error al procesar la factura' })
  }
})

router.post('/guardar', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    const datos = JSON.parse(req.body.datos)

    if (!datos.proveedor) return res.status(400).json({ error: 'El nombre del proveedor es requerido' })
    if (!datos.numero_factura) return res.status(400).json({ error: 'El número de factura es requerido' })
    if (!datos.fecha_emision) return res.status(400).json({ error: 'La fecha de emisión es requerida' })
    if (!datos.monto_total || isNaN(parseFloat(datos.monto_total))) return res.status(400).json({ error: 'El monto total es requerido y debe ser un número válido' })
    if (!datos.tipo_doc || !['F', 'R'].includes(datos.tipo_doc)) return res.status(400).json({ error: 'El tipo de documento debe ser Factura (F) o Recibo (R)' })
    if (!datos.id_viaje) return res.status(400).json({ error: 'El viaje asociado es requerido' })

    const validacion = await validarPlazoViaje(datos.id_viaje, datos.fecha_emision)
    if (!validacion.valido) {
      return res.status(400).json({ error: validacion.error, requiereAutorizacion: !!validacion.requiereAutorizacion })
    }

    const nombreProveedor = datos.proveedor.trim()

    let id_proveedor = null
    const { data: proveedorExistente } = await supabase
      .from('Proveedor')
      .select('id_proveedor')
      .ilike('nombre', nombreProveedor)
      .limit(1)
      .maybeSingle()

    if (proveedorExistente) {
      id_proveedor = proveedorExistente.id_proveedor
      if (datos.nit) {
        await supabase
          .from('Proveedor')
          .update({ numero_doc_fiscal: datos.nit, tipo_doc_fiscal: detectarTipoDoc(datos.nit) })
          .eq('id_proveedor', proveedorExistente.id_proveedor)
      }
    } else {
      const { data: nuevoProv, error: provError } = await supabase
        .from('Proveedor')
        .insert({ nombre: nombreProveedor, numero_doc_fiscal: datos.nit || null, tipo_doc_fiscal: detectarTipoDoc(datos.nit) })
        .select()
        .single()
      if (provError) return res.status(500).json({ error: provError.message })
      id_proveedor = nuevoProv?.id_proveedor
    }

    const { data: gasto, error: gastoError } = await supabase
      .from('Gasto')
      .insert({
        monto_total: datos.monto_total,
        fecha_gasto: datos.fecha_emision,
        descripcion: `Factura ${datos.numero_factura} - ${nombreProveedor}`,
        tipo: datos.tipo_doc,
        modificado: datos.modificado_manualmente ? true : false,
        id_viaje: datos.id_viaje,
        id_proveedor,
      })
      .select()
      .single()

    if (gastoError) return res.status(500).json({ error: gastoError.message })

    const { data: facturaData, error: facturaError } = await supabase
      .from('Factura')
      .insert({
        numero_factura: datos.numero_factura,
        fecha_emision: datos.fecha_emision,
        monto_parcial: datos.monto,
        id_gasto: gasto.id_gasto,
        id_proveedor,
      })
      .select()
      .single()

    if (facturaError) {
      await supabase.from('Gasto').delete().eq('id_gasto', gasto.id_gasto)
      if (facturaError.code === '23505') {
        return res.status(400).json({ error: `La factura número ${datos.numero_factura} de este proveedor ya fue registrada para esta fecha` })
      }
      return res.status(500).json({ error: facturaError.message })
    }

    if (datos.detalle && datos.detalle.length > 0) {
      const detalles = datos.detalle.map((d) => ({
        nombre_producto: d.nombre_producto,
        cantidad: d.cantidad,
        precio: d.precio,
        id_factura: facturaData.id_factura,
      }))
      const { error: detalleError } = await supabase.from('Detalle_Factura').insert(detalles)
      if (detalleError) {
        await supabase.from('Factura').delete().eq('id_factura', facturaData.id_factura)
        await supabase.from('Gasto').delete().eq('id_gasto', gasto.id_gasto)
        return res.status(500).json({ error: detalleError.message })
      }
    }

    try {
      await actualizarAlcoholEnViaje(datos.id_viaje)
    } catch (e) {
      console.warn('Error alcohol:', e.message)
    }

    if (datos.iva && parseFloat(datos.iva) > 0) {
      const nombreIva = `IVA ${IVA_PORCENTAJE_BOLIVIA}%`
      let id_impuesto = null

      const { data: impuestoExistente } = await supabase
        .from('Impuesto')
        .select('id_impuesto')
        .eq('porcentaje', IVA_PORCENTAJE_BOLIVIA)
        .single()

      if (impuestoExistente) {
        id_impuesto = impuestoExistente.id_impuesto
      } else {
        const { data: nuevoImpuesto, error: impuestoError } = await supabase
          .from('Impuesto')
          .insert({ nombre: nombreIva, porcentaje: IVA_PORCENTAJE_BOLIVIA })
          .select()
          .single()
        if (!impuestoError) id_impuesto = nuevoImpuesto.id_impuesto
      }

      if (id_impuesto) {
        await supabase.from('Factura_Impuestos').insert({ id_factura: facturaData.id_factura, id_impuesto })
      }
    }

    if (req.file) {
      const extension = req.file.originalname.split('.').pop()
      const fileName = `facturas/${gasto.id_gasto}_${Date.now()}.${extension}`
      const { error: storageError } = await supabase.storage
        .from('facturas')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype })
      if (!storageError) {
        const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)
        await supabase.from('Imagen').insert({ url_archivo: urlData.publicUrl, id_gasto: gasto.id_gasto })
      }
    }

    return res.json({ message: 'Factura guardada correctamente', gasto })
  } catch (error) {
    console.log('Error guardando factura:', error.message)
    return res.status(500).json({ error: error.message || 'Error al guardar la factura' })
  }
})

router.put('/:id_gasto/actualizar', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    const datos = JSON.parse(req.body.datos)
    const id_gasto = req.params.id_gasto

    if (!datos.proveedor) return res.status(400).json({ error: 'El nombre del proveedor es requerido' })
    if (!datos.fecha_emision) return res.status(400).json({ error: 'La fecha de emisión es requerida' })
    if (!datos.monto_total || isNaN(parseFloat(datos.monto_total))) return res.status(400).json({ error: 'El monto total es requerido' })

    if (datos.id_viaje) {
      const validacion = await validarPlazoViaje(datos.id_viaje, datos.fecha_emision)
      if (!validacion.valido) {
        return res.status(400).json({ error: validacion.error, requiereAutorizacion: !!validacion.requiereAutorizacion })
      }
    }

    const nombreProveedor = datos.proveedor.trim()

    let id_proveedor = null
    const { data: proveedorExistente } = await supabase
      .from('Proveedor')
      .select('id_proveedor')
      .ilike('nombre', nombreProveedor)
      .limit(1)
      .maybeSingle()

    if (proveedorExistente) {
      id_proveedor = proveedorExistente.id_proveedor
      if (datos.nit) {
        await supabase
          .from('Proveedor')
          .update({ numero_doc_fiscal: datos.nit, tipo_doc_fiscal: detectarTipoDoc(datos.nit) })
          .eq('id_proveedor', proveedorExistente.id_proveedor)
      }
    } else {
      const { data: nuevoProv, error: provError } = await supabase
        .from('Proveedor')
        .insert({ nombre: nombreProveedor, numero_doc_fiscal: datos.nit || null, tipo_doc_fiscal: detectarTipoDoc(datos.nit) })
        .select()
        .single()
      if (provError) return res.status(500).json({ error: provError.message })
      id_proveedor = nuevoProv?.id_proveedor
    }

    const { error: gastoError } = await supabase
      .from('Gasto')
      .update({
        monto_total: parseFloat(datos.monto_total),
        fecha_gasto: datos.fecha_emision,
        descripcion: `Factura ${datos.numero_factura} - ${nombreProveedor}`,
        tipo: datos.tipo_doc,
        modificado: true,
        id_proveedor,
      })
      .eq('id_gasto', id_gasto)

    if (gastoError) return res.status(500).json({ error: gastoError.message })

    const { data: facturaExistente } = await supabase
      .from('Factura')
      .select('id_factura')
      .eq('id_gasto', id_gasto)
      .single()

    if (facturaExistente) {
      const { error: facturaUpdateError } = await supabase
        .from('Factura')
        .update({
          numero_factura: datos.numero_factura,
          fecha_emision: datos.fecha_emision,
          monto_parcial: datos.monto,
          id_proveedor,
        })
        .eq('id_factura', facturaExistente.id_factura)

      if (facturaUpdateError) {
        if (facturaUpdateError.code === '23505') {
          return res.status(400).json({ error: `La factura número ${datos.numero_factura} de este proveedor ya fue registrada para esta fecha` })
        }
        return res.status(500).json({ error: facturaUpdateError.message })
      }

      await supabase.from('Detalle_Factura').delete().eq('id_factura', facturaExistente.id_factura)

      if (datos.detalle && datos.detalle.length > 0) {
        const detalles = datos.detalle.map((d) => ({
          nombre_producto: d.nombre_producto,
          cantidad: d.cantidad,
          precio: d.precio,
          id_factura: facturaExistente.id_factura,
        }))
        await supabase.from('Detalle_Factura').insert(detalles)
      }

      await supabase.from('Factura_Impuestos').delete().eq('id_factura', facturaExistente.id_factura)

      if (datos.iva && parseFloat(datos.iva) > 0) {
        const nombreIva = `IVA ${IVA_PORCENTAJE_BOLIVIA}%`
        let id_impuesto = null

        const { data: impuestoExistente } = await supabase
          .from('Impuesto')
          .select('id_impuesto')
          .eq('porcentaje', IVA_PORCENTAJE_BOLIVIA)
          .single()

        if (impuestoExistente) {
          id_impuesto = impuestoExistente.id_impuesto
        } else {
          const { data: nuevoImpuesto } = await supabase
            .from('Impuesto')
            .insert({ nombre: nombreIva, porcentaje: IVA_PORCENTAJE_BOLIVIA })
            .select()
            .single()
          if (nuevoImpuesto) id_impuesto = nuevoImpuesto.id_impuesto
        }

        if (id_impuesto) {
          await supabase.from('Factura_Impuestos').insert({ id_factura: facturaExistente.id_factura, id_impuesto })
        }
      }
    }

    if (datos.id_viaje) {
      try {
        await actualizarAlcoholEnViaje(datos.id_viaje)
      } catch (e) {
        console.warn('Error alcohol:', e.message)
      }
    }

    if (req.file && !datos.mantener_imagen) {
      await supabase.from('Imagen').delete().eq('id_gasto', id_gasto)
      const extension = req.file.originalname.split('.').pop()
      const fileName = `facturas/${id_gasto}_${Date.now()}.${extension}`
      const { error: storageError } = await supabase.storage
        .from('facturas')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype })
      if (!storageError) {
        const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)
        await supabase.from('Imagen').insert({ url_archivo: urlData.publicUrl, id_gasto })
      }
    }

    return res.json({ message: 'Factura actualizada correctamente' })
  } catch (error) {
    console.log('Error actualizando factura:', error.message)
    return res.status(500).json({ error: error.message || 'Error al actualizar la factura' })
  }
})

module.exports = router;