const express = require('express')
const router = express.Router()
const authMiddleware = require('../../middlewares/auth')
const tripController = require('../../controllers/trip/tripController')

router.get('/', authMiddleware, tripController.getAllTrips)
router.get('/dashboard', authMiddleware, tripController.getDashboard)
router.get('/history', authMiddleware, tripController.getHistory)
router.get('/:id', authMiddleware, tripController.getTripDetail)
router.post('/', authMiddleware, tripController.createTrip)
router.put('/:id', authMiddleware, tripController.updateTrip)
router.put('/:id/edit', authMiddleware, tripController.editTrip)
router.put('/:id/submit-review', authMiddleware, tripController.submitToReview)
router.put('/:id/confirm-completion', authMiddleware, tripController.confirmCompletion)
router.delete('/:id', authMiddleware, tripController.deleteTrip)

module.exports = router;