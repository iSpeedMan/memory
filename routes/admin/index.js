const express = require('express');
const categoriesRouter = require('./categories');
const usersRouter = require('./users');
const statsRouter = require('./stats');
const coinsRouter = require('./coins');

const router = express.Router();

router.use('/', categoriesRouter);
router.use('/', usersRouter);
router.use('/', statsRouter);
router.use('/', coinsRouter);

module.exports = router;
