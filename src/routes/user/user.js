const express = require('express')
const router = express.Router()
const multer = require('multer')
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const userController = require('../../controllers/user/userController')
const maxProfilePhotoSize = 5 * 1024 * 1024
const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: maxProfilePhotoSize, files: 1},
  fileFilter: (req, file, callback) => {
    if (!allowedImageTypes.includes(file.mimetype)) {
      return callback(new Error('Solo se permiten imágenes JPG, PNG o WEBP'))
    }
    callback(null, true)
  },
})

router.get('/me', authMiddleware, userController.getMe)
router.put('/me/update', authMiddleware, userController.updateMe)
router.put('/me/photo', authMiddleware, upload.single('foto'), userController.updateMyPhoto)
router.put('/me/change-password', authMiddleware, userController.changeMyPassword)
router.get('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), userController.getAllUsers)
router.put('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), userController.updateUser)
router.post('/', authMiddleware, roleMiddleware(['ADMINISTRADOR']), userController.createUser)
router.delete('/:id', authMiddleware, roleMiddleware(['ADMINISTRADOR']), userController.deleteUser)
router.post('/check-email', userController.checkEmail)
router.get('/employees', authMiddleware, roleMiddleware(['SUPERVISOR', 'ADMINISTRADOR', 'REVISOR', 'APROBADOR', 'EMPLEADO']), userController.getEmployees)
router.get('/all', authMiddleware, roleMiddleware(['ADMINISTRADOR']), userController.getAllUsersDetailed)
router.patch('/:id/activate', authMiddleware, roleMiddleware(['ADMINISTRADOR']), userController.activateUser)
router.patch('/:id/suspend', authMiddleware, roleMiddleware(['ADMINISTRADOR']), userController.suspendUser)
router.get('/my-position', authMiddleware, userController.getMyPosition)

module.exports = router;