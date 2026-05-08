const revisarRol=(rolesPermitidos)=>{
    return (req,res,next)=>{
        const {rol}=req.user;
        if(rolesPermitidos.includes(rol)){  
            next();
        }
        else{
            return res.status(402).json({error: 'Acceso denegado, rol no permitido'});
        }
    }
}

module.exports=revisarRol;