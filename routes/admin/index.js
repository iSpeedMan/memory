const express = require('express');
const categoriesRouter = require('./categories');
const usersRouter = require('./users');
const statsRouter = require('./stats');

const router = express.Router();

router.use('/', categoriesRouter);
router.use('/', usersRouter);
router.use('/', statsRouter);

module.exports = router;
