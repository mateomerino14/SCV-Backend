const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { route } = require('./auditoria');




router.get('/',async(req,res)=>{
    const{data,error}=await supabase.from('Proveedor').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


router.put('/:id',async(req,res)=>{
    const{data,error}=await supabase.from('Proveedor').update(req.body).eq('id_proveedor',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.post('/',async(req,res)=>{
    const{data,error}=await supabase.from('Proveedor').insert(req.body).select();
    if(error){
        return res.status(500).json({error:error.message});
    }
    return res.json(data);
});

router.delete('/:id',async(req,res)=>{
    const{data,error}=await supabase.from('Proveedor').delete().eq('id_proveedor',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

module.exports=router;
