const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const deadlineAuthorizationController = require('../../controllers/approval/deadlineAuthorizationController')

router.post('/trip/:tripId/request', authMiddleware, deadlineAuthorizationController.createRequest)
router.get('/trip/:tripId/status', authMiddleware, deadlineAuthorizationController.getRequestStatus)
router.get('/pending', authMiddleware, roleMiddleware(['REVISOR']), deadlineAuthorizationController.getPendingRequests)
router.get('/history', authMiddleware, roleMiddleware(['REVISOR']), deadlineAuthorizationController.getRequestHistory)
router.post('/:requestId/approve', authMiddleware, roleMiddleware(['REVISOR']), deadlineAuthorizationController.approveRequest)
router.post('/:requestId/reject', authMiddleware, roleMiddleware(['REVISOR']), deadlineAuthorizationController.rejectRequest)

module.exports = router;