const express= require('express');
const router= express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleMiddleware = require('../middleware/role');

//CON SEGURIDAD JWT Y ROLES, SOLO USUARIOS AUTENTICADOS CON ROL DE ADMINISTRADOR PUEDEN ACCEDER A ESTAS RUTAS

router.get('/',authMiddleware,async(req,res)=>{
    const {data,error}=await supabase.from('Categoria_Gasto').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.post('/',authMiddleware,roleMiddleware(['ADMINISTRADOR,SUPERVISOR']),async(req,res)=>{  
    const {data,error}=await supabase.from('Categoria_Gasto').insert(req.body).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

module.exports=router;