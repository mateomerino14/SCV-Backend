const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/roleAuth');
const supplierController = require('../../controllers/expense/supplierController');

router.get('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), supplierController.getAllSuppliers);
router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), supplierController.updateSupplier);
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), supplierController.createSupplier);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), supplierController.deleteSupplier);

module.exports = router;