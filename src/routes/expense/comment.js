const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const commentController = require('../../controllers/expense/commentController')

router.get('/', authMiddleware, commentController.getAllComments)
router.put('/:id', authMiddleware, roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR']), commentController.updateComment)
router.post('/', authMiddleware, roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR']), commentController.createComment)
router.delete('/:id', authMiddleware, roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR']), commentController.deleteComment)

module.exports = router;