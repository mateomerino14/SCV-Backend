const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/',async(req,res)=>{
    const{data,error}=await supabase.from('Cargo').select('*');
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});

router.put('/:id',async(req,res)=>{
    const{data,error}=await supabase.from('Cargo').update(req.body).eq('id_cargo',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }
    return res.json(data);
});


router.post('/',async(req,res)=>{
    const{data,error}=await supabase.from('Cargo').insert(req.body).select();
    if(error){
        return res.status(500).json({error:error.message});
    }
    return res.json(data);
});

router.delete('/:id',async(req,res)=>{
    const{data,error}=await supabase.from('Cargo').delete().eq('id_cargo',req.params.id).select();
    if(error){
        return res.status(500).json({error: error.message});
    }   
    return res.json(data);
});

module.exports=router;