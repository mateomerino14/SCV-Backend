const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const roleMiddleware = require('../../middlewares/roleAuth')
const reviewerController = require('../../controllers/approval/reviewerController')

router.get('/pending', authMiddleware, roleMiddleware(['REVISOR']), reviewerController.getPendingReviews)
router.get('/mine', authMiddleware, roleMiddleware(['REVISOR']), reviewerController.getMyReviews)
router.get('/:tripId', authMiddleware, roleMiddleware(['REVISOR']), reviewerController.getReviewDetail)
router.post('/:tripId/approve', authMiddleware, roleMiddleware(['REVISOR']), reviewerController.approveReview)
router.post('/:tripId/reject', authMiddleware, roleMiddleware(['REVISOR']), reviewerController.rejectReview)
router.post('/:tripId/comment', authMiddleware, roleMiddleware(['REVISOR']), reviewerController.addComment)
router.put('/:tripId/comment/:commentId', authMiddleware, roleMiddleware(['REVISOR']), reviewerController.editComment)
router.delete('/:tripId/comment/:commentId', authMiddleware, roleMiddleware(['REVISOR']), reviewerController.deleteComment)

module.exports = router;