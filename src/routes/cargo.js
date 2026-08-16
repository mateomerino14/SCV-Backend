const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleAuth');

//CON SEGURIDAD JWT Y ROLES, SOLO USUARIOS AUTENTICADOS CON ROL DE ADMINISTRADOR PUEDEN ACCEDER A ESTAS RUTAS

const normalizarNombreCargo = (nombre) =>
  (nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ')

async function validarCargoNoDuplicado(nombre, id_cargo_excluir) {
  if (!nombre || !nombre.trim()) return null
  const nombreNorm = normalizarNombreCargo(nombre)

  let query = supabase.from('Cargo').select('id_cargo, nombre')
  if (id_cargo_excluir) query = query.neq('id_cargo', id_cargo_excluir)

  const { data, error } = await query
  if (error) return null

  const yaExiste = (data || []).some(c => normalizarNombreCargo(c.nombre) === nombreNorm)
  if (yaExiste) return `Ya existe un cargo con el nombre "${nombre.trim()}". No se permiten cargos duplicados.`
  return null
}

router.get('/',authMiddleware,async(req,res)=>{
    const{data,error}=await supabase.from('Cargo').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data); 
});

router.put('/:id',authMiddleware,roleMiddleware(['ADMINISTRADOR']),async(req,res)=>{
    if (req.body.nombre !== undefined) {
        const errorDuplicado = await validarCargoNoDuplicado(req.body.nombre, req.params.id)
        if (errorDuplicado) return res.status(400).json({ error: errorDuplicado })
    }
    const{data,error}=await supabase.from('Cargo').update(req.body).eq('id_cargo',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


router.post('/',authMiddleware,roleMiddleware(['ADMINISTRADOR']),async(req,res)=>{
    const errorDuplicado = await validarCargoNoDuplicado(req.body.nombre, null)
    if (errorDuplicado) return res.status(400).json({ error: errorDuplicado })
    const{data,error}=await supabase.from('Cargo').insert(req.body).select();
    if(error){
        return res.status(500).json({error:error.message});
    }
    return res.json(data);
});

router.delete('/:id',authMiddleware,roleMiddleware(['ADMINISTRADOR']),async(req,res)=>{
    const{data,error}=await supabase.from('Cargo').delete().eq('id_cargo',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }   
    return res.json(data);
});

router.patch('/:id/suspender', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Cargo')
    .update({ activo: false })
    .eq('id_cargo', req.params.id)
    .select()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

router.patch('/:id/activar', authMiddleware, roleMiddleware(['ADMINISTRADOR']), async (req, res) => {
  const { data, error } = await supabase
    .from('Cargo')
    .update({ activo: true })
    .eq('id_cargo', req.params.id)
    .select()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

module.exports=router;