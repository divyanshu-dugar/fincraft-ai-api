const express = require('express');
const router = express.Router();
const requireAuth = require('../auth/require-auth');
const { getProfile, updateProfile, changePassword, deleteAccount } = require('../controllers/profile');

router.get('/', requireAuth(), getProfile);
router.patch('/', requireAuth(), updateProfile);
router.patch('/change-password', requireAuth(), changePassword);
router.delete('/', requireAuth(), deleteAccount);

module.exports = router;
