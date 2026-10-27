const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/roleAuth');
const reviewController = require('../../controllers/approval/reviewController');

// El aprobador revisa como jefe directo a su equipo, pero no toma viajes de la bandeja sin asignar
const teamReviewRoles = ['SUPERVISOR', 'APROBADOR'];

router.get('/trip-review/pending', authMiddleware, roleMiddleware(['SUPERVISOR']), reviewController.getPendingTripReviews);
router.get('/trip-review/mine', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.getMyTripReviews);
router.post('/trip-review/:tripId/take', authMiddleware, roleMiddleware(['SUPERVISOR']), reviewController.takeTripReview);
router.post('/trip-review/:tripId/return', authMiddleware, roleMiddleware(['SUPERVISOR']), reviewController.returnTripReview);
router.get('/trip-review/:tripId', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.getTripReviewDetail);
router.post('/trip-review/:tripId/approve', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.approveTripReview);
router.post('/trip-review/:tripId/reject', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.rejectTripReview);
router.post('/trip-review/:tripId/comment', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.addTripReviewComment);
router.put('/trip-review/:tripId/comment/:commentId', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.editTripReviewComment);
router.delete('/trip-review/:tripId/comment/:commentId', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.deleteTripReviewComment);

router.get('/expense-review/pending', authMiddleware, roleMiddleware(['SUPERVISOR']), reviewController.getPendingExpenseReviews);
router.get('/expense-review/mine', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.getMyExpenseReviews);
router.post('/expense-review/:tripId/take', authMiddleware, roleMiddleware(['SUPERVISOR']), reviewController.takeExpenseReview);
router.post('/expense-review/:tripId/return', authMiddleware, roleMiddleware(['SUPERVISOR']), reviewController.returnExpenseReview);
router.get('/expense-review/:tripId', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.getExpenseReviewDetail);
router.post('/expense-review/:tripId/approve', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.approveExpenseReview);
router.post('/expense-review/:tripId/reject', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.rejectExpenseReview);
router.post('/expense-review/:tripId/comment', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.addExpenseReviewComment);
router.put('/expense-review/:tripId/comment/:commentId', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.editExpenseReviewComment);
router.delete('/expense-review/:tripId/comment/:commentId', authMiddleware, roleMiddleware(teamReviewRoles), reviewController.deleteExpenseReviewComment);

module.exports = router;