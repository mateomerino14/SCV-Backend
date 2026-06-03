const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleAuth');

//CON SEGURIDAD JWT Y ROLES, SOLO USUARIOS AUTENTICADOS CON ROL DE ADMINISTRADOR PUEDEN ACCEDER A ESTAS RUTAS

router.get('/',authMiddleware,async(req,res)=>{
    const{data,error}=await supabase.from('Cargo').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data); 
});

router.put('/:id',authMiddleware,roleMiddleware(['ADMINISTRADOR']),async(req,res)=>{
    const{data,error}=await supabase.from('Cargo').update(req.body).eq('id_cargo',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


router.post('/',authMiddleware,roleMiddleware(['ADMINISTRADOR']),async(req,res)=>{
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