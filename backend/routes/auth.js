const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const generateToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    try {
        // Allow login by username OR email
        const user = await User.findOne({
            $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }]
        });
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ message: 'Invalid credentials. Access denied.' });
        }
        res.json({
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                role: user.role,
                badge: user.badge,
                rank: user.rank,
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/auth/me — Get current logged-in user
router.get('/me', protect, (req, res) => {
    res.json({
        user: {
            id: req.user._id,
            name: req.user.name,
            username: req.user.username,
            role: req.user.role,
            badge: req.user.badge,
            rank: req.user.rank,
        }
    });
});

// POST /api/auth/register — Admin only: create new user account
router.post('/register', protect, authorize('admin'), async (req, res) => {
    const { name, username, email, password, role, badge, rank } = req.body;
    if (!name || !username || !email || !password) {
        return res.status(400).json({ message: 'Name, username, email, and password are required.' });
    }
    try {
        const exists = await User.findOne({
            $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }]
        });
        if (exists) {
            return res.status(400).json({ message: 'Username or email already in use.' });
        }
        const user = await User.create({
            name, username, email, password,
            role: role || 'viewer',
            badge: badge || '',
            rank: rank || 'OFFICER',
        });
        res.status(201).json({
            message: 'User created successfully.',
            user: { id: user._id, name: user.name, role: user.role }
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// POST /api/auth/register-citizen — Public registration for citizens
router.post('/register-citizen', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required.' });
    }
    try {
        const username = email; // For citizens, we'll just use their email as username
        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) {
            return res.status(400).json({ message: 'Email already in use.' });
        }
        const user = await User.create({
            name, username, email, password,
            role: 'citizen',
            badge: '',
            rank: 'CIVILIAN',
        });
        res.status(201).json({
            message: 'Citizen account created successfully.',
            token: generateToken(user._id),
            user: { id: user._id, name: user.name, role: user.role }
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// GET /api/auth/setup — One-time admin seed (only works if NO users exist yet)
router.get('/setup', async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        if (userCount > 0) {
            return res.status(403).json({
                message: 'Setup already completed. This endpoint is now disabled.',
                users: userCount
            });
        }

        await User.create({
            name:     'System Admin',
            username: 'admin',
            email:    'admin@crms.gov',
            password: 'admin123',
            role:     'admin',
            badge:    'ADM-001',
            rank:     'ADMINISTRATOR',
        });

        res.json({
            message: '✅ Admin user created successfully!',
            credentials: {
                username: 'admin',
                password: 'admin123',
                note: '⚠️ Change your password after first login!'
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
