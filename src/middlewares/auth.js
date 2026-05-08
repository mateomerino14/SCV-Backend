const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
    const token=req.headers['authorization'];
    if(!token){
        return res.status(401).json({error: 'Acceso denegado, token no proporcionado'});
    }
    try{
        const decoded=jwt.veify(token,process.env.JWT_SECRET);
        req.user=decoded;
        next();
    }
    catch(error){
        return res.status(400).json({error: 'Token inválido'});
    }   
}

module.exports=authMiddleware;