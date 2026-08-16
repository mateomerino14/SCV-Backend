const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const imageController = require('../../controllers/expense/imageController')

router.get('/', authMiddleware, imageController.getAllImages)
router.post('/', authMiddleware, imageController.createImage)
router.put('/:id', authMiddleware, imageController.updateImage)
router.delete('/:id', authMiddleware, imageController.deleteImage)

module.exports = router;