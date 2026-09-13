const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const substitutionController = require('../../controllers/approval/substitutionController')

router.post('/trip/:tripId/request', authMiddleware, substitutionController.createRequest)
router.get('/trip/:tripId/status', authMiddleware, substitutionController.getRequestStatus)
router.get('/pending', authMiddleware, roleMiddleware(['REVISOR']), substitutionController.getPendingRequests)
router.get('/history', authMiddleware, roleMiddleware(['REVISOR']), substitutionController.getRequestHistory)
router.post('/:requestId/approve', authMiddleware, roleMiddleware(['REVISOR']), substitutionController.approveRequest)
router.post('/:requestId/reject', authMiddleware, roleMiddleware(['REVISOR']), substitutionController.rejectRequest)
router.get('/mine', authMiddleware, substitutionController.getActiveSubstitutions)

module.exports = router;
