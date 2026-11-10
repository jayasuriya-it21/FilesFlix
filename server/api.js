'use strict';

const express = require('express');

const router = express.Router();

router.use(require('./routes/browse'));
router.use(require('./routes/stream'));
router.use(require('./routes/host'));

module.exports = router;
