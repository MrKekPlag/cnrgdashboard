const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const users = []; // In-memory user storage, use a database in production

const secretKey = 'your_secret_key';

// Register
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const userExists = users.find(u => u.username === username);
    if (userExists) {
        return res.status(409).send('User already exists');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    res.status(201).send('User registered');
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ username: user.username }, secretKey, { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(401).send('Invalid credentials');
    }
});

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).send('Token is required');

    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) return res.status(401).send('Invalid token');
        req.user = decoded;
        next();
    });
};

// Protected route example
router.get('/profile', verifyToken, (req, res) => {
    res.send(`Hello, ${req.user.username}`);
});

module.exports = router;
