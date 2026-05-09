const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleAuth');

//CON SEGURIDAD JWT, SOLO USUARIOS AUTENTICADOS PUEDEN ACCEDER A ESTAS RUTAS

router.get('/',authMiddleware,async(req,res)=>{
    const{data,error}=await supabase.from('Viaje').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
}); 



router.put('/:id',authMiddleware,async(req,res)=>{
    const{data,error}=await supabase.from('Viaje').update(req.body).eq('id_viaje',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.post('/',authMiddleware,async(req,res)=>{
    const{data,error}=await supabase.from('Viaje').insert(req.body).select();
    if(error){
        return res.status(500).json({error:error.message});
    }
    return res.json(data);
});

router.delete('/:id',authMiddleware,async(req,res)=>{
    const{data,error}=await supabase.from('Viaje').delete().eq('id_viaje',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

module.exports=router;