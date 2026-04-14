const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { protect, authorize } = require('../middleware/auth');

// Import Models
const Case = require('../models/Case');
const FIR = require('../models/FIR');
const Criminal = require('../models/Criminal');
const Evidence = require('../models/Evidence');
const Complaint = require('../models/Complaint');

// --- COMPLAINTS ROUTES ---
// Officers/Admins view all complaints
router.get('/complaints', protect, authorize('admin', 'officer'), async (req, res) => {
    try {
        const complaints = await Complaint.find().populate('citizenId', 'name email').sort({ filedAt: -1 });
        res.json(complaints);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Citizens view only their own complaints
router.get('/complaints/me', protect, authorize('citizen'), async (req, res) => {
    try {
        const complaints = await Complaint.find({ citizenId: req.user._id }).sort({ filedAt: -1 });
        res.json(complaints);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Citizens file a new complaint
router.post('/complaints', protect, authorize('citizen'), async (req, res) => {
    try {
        const newComplaint = new Complaint({
            ...req.body,
            citizenId: req.user._id
        });
        const saved = await newComplaint.save();
        res.status(201).json(saved);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Officers/Admins update complaint status
router.put('/complaints/:id/status', protect, authorize('admin', 'officer'), async (req, res) => {
    try {
        const { status } = req.body;
        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
        
        complaint.status = status;
        await complaint.save();
        res.json({ message: 'Status updated successfully', complaint });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- CASE ROUTES ---
router.get('/cases', protect, async (req, res) => {
    try {
        const cases = await Case.find().sort({ date: -1 });
        res.json(cases);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/cases', protect, authorize('admin', 'officer'), async (req, res) => {
    const newCase = new Case(req.body);
    try {
        const savedCase = await newCase.save();
        res.status(201).json(savedCase);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- FIR ROUTES ---
router.get('/firs', protect, async (req, res) => {
    try {
        const firs = await FIR.find().sort({ date: -1 });
        res.json(firs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/firs', protect, authorize('admin', 'officer'), async (req, res) => {
    const newFIR = new FIR(req.body);
    try {
        const savedFIR = await newFIR.save();
        res.status(201).json(savedFIR);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- CRIMINAL ROUTES ---
router.get('/criminals', protect, async (req, res) => {
    try {
        const criminals = await Criminal.find();
        res.json(criminals);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/criminals', protect, authorize('admin', 'officer'), async (req, res) => {
    const newCriminal = new Criminal(req.body);
    try {
        const savedCriminal = await newCriminal.save();
        res.status(201).json(savedCriminal);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- EVIDENCE ROUTES ---
router.get('/evidence', protect, async (req, res) => {
    try {
        const evidence = await Evidence.find();
        res.json(evidence);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/evidence', protect, authorize('admin', 'officer'), async (req, res) => {
    const newEvidence = new Evidence(req.body);
    try {
        const savedEvidence = await newEvidence.save();
        res.status(201).json(savedEvidence);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- STATS ROUTE ---
router.get('/stats', protect, async (req, res) => {
    try {
        const activeCases = await Case.countDocuments({ status: 'Active' });
        const solvedCases = await Case.countDocuments({ status: 'Solved' });
        const totalCases = await Case.countDocuments();
        const solvedRate = totalCases > 0 ? ((solvedCases / totalCases) * 100).toFixed(0) : 0;
        
        const wantedCriminals = await Criminal.countDocuments({ status: 'Wanted' });
        
        // FIRs this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0,0,0,0);
        const firsThisMonth = await FIR.countDocuments({ date: { $gte: startOfMonth } });

        res.json({
            activeCases,
            wantedCriminals,
            firsThisMonth,
            solvedRate
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- GEMINI SMART SEARCH ---
router.post('/smart-search', protect, async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ message: 'Query is required for smart search.' });
    }
    
    try {
        // Fetch context from the database to inject into Gemini prompt
        const [cases, criminals, firs, evidence] = await Promise.all([
            Case.find().limit(20),
            Criminal.find().limit(20),
            FIR.find().limit(20),
            Evidence.find().limit(20)
        ]);

        const contextData = {
            recentCases: cases,
            criminals: criminals,
            recentFIRs: firs,
            evidenceLogs: evidence
        };

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ message: 'Gemini API key is not configured on the server.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `You are a highly intelligent police records analyst AI. 
        You have access to the following partial database dump:
        ${JSON.stringify(contextData)}
        
        The user has asked the following query:
        "${query}"
        
        Answer the query intelligently using **only** the provided database context. 
        If the answer is not in the context, clearly state that you don't have records matching the query.
        Keep the response concise, professional, and formatted in short paragraphs or bullet points where suitable.`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        res.json({ result: text });
    } catch (err) {
        console.error('Gemini Search Error:', err.message);
        res.status(500).json({ message: 'Error processing smart query. ' + err.message });
    }
});

module.exports = router;
