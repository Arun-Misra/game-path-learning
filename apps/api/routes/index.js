const express = require('express');
const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    name: 'Gamified Learning API',
    version: 'v1',
    status: 'ready',
  });
});

module.exports = router;
