const supabase = require('../../config/supabase')

// Detecta si un numero de documento fiscal es NIT o CI segun su longitud
const detectTaxDocType = (taxId) => {
  if (!taxId || taxId === 'No Especificado') {
    return null
  }
  const digitsOnly = taxId.replace(/[-.\s]/g, '')
  if (/^[0-9]+$/.test(digitsOnly)) {
    if (digitsOnly.length >= 9) {
      return 'NIT'
    }
    else {
      return 'CI'
    }
  }
  else {
    return 'NIT'
  }
};

// Busca un proveedor por nombre, o lo crea si no existe
const findOrCreateSupplier = async (supplierName) => {
  if (!supplierName) {
    return null
  }
  const {data: existingSupplier} = await supabase.from('Proveedor').select('id_proveedor').ilike('nombre', supplierName.trim()).limit(1).maybeSingle()
  if (existingSupplier) {
    return existingSupplier.id_proveedor
  }
  else {
    const {data: newSupplier} = await supabase.from('Proveedor').insert({nombre: supplierName.trim()}).select().single()
    return newSupplier?.id_proveedor
  }
};

// Actualiza el documento fiscal de un proveedor existente
const updateSupplierTaxId = async (supplierId, taxId) => {
  if (!taxId) {
    return
  }
  await supabase
    .from('Proveedor')
    .update({numero_doc_fiscal: taxId, tipo_doc_fiscal: detectTaxDocType(taxId)})
    .eq('id_proveedor', supplierId)
};

module.exports = {detectTaxDocType, findOrCreateSupplier, updateSupplierTaxId};