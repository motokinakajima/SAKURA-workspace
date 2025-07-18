const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
    res.render('index', { userID: req.session.userID });
});

module.exports = router;
