const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/',async(req,res)=>{
    const{data,error}=await supabase.from('Impuesto').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.put('/:id',async(req,res)=>{
    const{data,error}=await supabase.from('Impuesto').update(req.body).eq('id_impuesto',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.post('/',async(req,res)=>{
    const{data,error}=await supabase.from('Impuesto').insert(req.body).select();
    if(error){
        return res.status(500).json({error:error.message});
    }
    return res.json(data);
});


router.delete('/:id',async(req,res)=>{
    const{data,error}=await supabase.from('Impuesto').delete().eq('id_impuesto',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


module.exports=router;