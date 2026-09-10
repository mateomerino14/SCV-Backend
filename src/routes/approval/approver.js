const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const approverController = require('../../controllers/approval/approverController')

router.get('/pending-trips', authMiddleware, roleMiddleware(['APROBADOR']), approverController.getPendingTrips)
router.get('/my-trips', authMiddleware, roleMiddleware(['APROBADOR']), approverController.getMyTrips)
router.get('/trip/:tripId', authMiddleware, roleMiddleware(['APROBADOR']), approverController.getTripDetail)
router.post('/trip/:tripId/approve', authMiddleware, roleMiddleware(['APROBADOR']), approverController.approveTrip)
router.post('/trip/:tripId/reject', authMiddleware, roleMiddleware(['APROBADOR']), approverController.rejectTrip)
router.post('/trip/:tripId/comment', authMiddleware, roleMiddleware(['APROBADOR']), approverController.addComment)
router.put('/trip/:tripId/comment/:commentId', authMiddleware, roleMiddleware(['APROBADOR']), approverController.editComment)
router.delete('/trip/:tripId/comment/:commentId', authMiddleware, roleMiddleware(['APROBADOR']), approverController.deleteComment)

module.exports = router;