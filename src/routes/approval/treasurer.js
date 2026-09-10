const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const requireTreasurerPosition = require('../../middlewares/treasurerPosition')
const treasurerController = require('../../controllers/approval/treasurerController')

router.get('/pending-trips', authMiddleware, requireTreasurerPosition, treasurerController.getPendingTrips)
router.get('/my-trips', authMiddleware, requireTreasurerPosition, treasurerController.getMyTrips)
router.get('/:tripId', authMiddleware, requireTreasurerPosition, treasurerController.getTripDetail)
router.put('/:tripId/amounts', authMiddleware, requireTreasurerPosition, treasurerController.updateAmounts)
router.post('/:tripId/approve', authMiddleware, requireTreasurerPosition, treasurerController.approveTrip)
router.post('/:tripId/reject', authMiddleware, requireTreasurerPosition, treasurerController.rejectTrip)
router.post('/:tripId/comment', authMiddleware, requireTreasurerPosition, treasurerController.addComment)
router.put('/:tripId/comment/:commentId', authMiddleware, requireTreasurerPosition, treasurerController.editComment)
router.delete('/:tripId/comment/:commentId', authMiddleware, requireTreasurerPosition, treasurerController.deleteComment)

module.exports = router;