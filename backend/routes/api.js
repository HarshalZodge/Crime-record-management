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
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

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

// --- GEMINI SMART INVESTIGATOR (CHATBOT) ---
router.post('/ai/investigator', protect, authorize('citizen'), async (req, res) => {
    const { history, message } = req.body;
    
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'Gemini API not configured' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const systemPrompt = `You are an intelligent Police Intake AI Assistant for the Citizen Portal.
        Your goal is to converse with the user and gather exactly these 4 pieces of information necessary to file an official police complaint:
        1. subject (A short title for the incident, e.g., "Stolen Bicycle", "Noise Complaint")
        2. contactNo (A phone number to reach them at)
        3. incidentDate (A valid date sting or YYYY-MM-DD representation)
        4. location (The specific street, address, or landmark)
        5. description (A comprehensive description of what occurred, based on their messages)

        Rules:
        - Only ask for one or two missing pieces of information at a time.
        - Be highly professional, empathetic, and polite.
        - The conversation history is provided to you.
        - YOU MUST RESPOND IN PURE JSON FORMAT EXACTLY LIKE THIS:
        {
          "reply": "Your next conversational message to the user.",
          "status": "INCOMPLETE",
          "extractedData": { "subject": "", "contactNo": "", "incidentDate": "", "location": "", "description": "" } 
        }
        
        Set status to "INCOMPLETE" and leave extractedData fields blank or partially empty if you don't have all 4 pieces of information confidently.
        Once the user has provided all necessary details, set status to "COMPLETE" and fill out the extractedData object fully with the finalized information, and set "reply" to a final thank you message.`;

        const model = genAI.getGenerativeModel({ 
            model: "gemini-pro"
        });

        // Format history for Gemini chat format
        let chatHistory = [];
        if (history && history.length > 0) {
            chatHistory = history.map(h => ({
                role: h.role, 
                parts: [{ text: h.text }]
            }));
        }

        const chat = model.startChat({
            history: chatHistory
        });
        
        let finalMessage = message;
        if (chatHistory.length === 0) {
            finalMessage = systemPrompt + "\n\nUser Message: " + message;
        }

        const result = await chat.sendMessage(finalMessage);
        let rawText = result.response.text();
        
        // Remove markdown tags if Gemini wraps the JSON output
        if (rawText.startsWith('```json')) {
            rawText = rawText.replace(/```json\n?/, '').replace(/```\n?$/, '').trim();
        } else if (rawText.startsWith('```')) {
            rawText = rawText.replace(/```\n?/, '').replace(/```\n?$/, '').trim();
        }
        
        res.json(JSON.parse(rawText));
    } catch (err) {
        console.error('AI Investigator Error:', err);
        res.status(500).json({ error: 'AI Error: ' + err.message });
    }
});

// --- GEMINI AI INSIGHTS (Cross-reference Complaint) ---
router.get('/ai/analyze-complaint/:id', protect, authorize('admin', 'officer'), async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });

        // Grab highly actionable context
        const [wantedCriminals, activeCases] = await Promise.all([
            Criminal.find({ status: 'Wanted' }),
            Case.find({ status: 'Active' })
        ]);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ message: 'Gemini API not configured' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `You are a highly intelligent Police Data Analyst AI.
        A citizen just filed the following complaint:
        Subject: ${complaint.subject}
        Location: ${complaint.location}
        Date: ${complaint.incidentDate}
        Details: ${complaint.description}

        Here is the current Active Wanted Criminals database:
        ${JSON.stringify(wantedCriminals)}

        Here is the current Active Police Cases database:
        ${JSON.stringify(activeCases)}

        YOUR TASK: Cross-reference the civilian complaint with the police databases. 
        Are there any suspicious similarities? Does the description match a wanted criminal's M.O.? Does the location or crime type align with an active case?
        
        Write a concise, high-level intelligence report (max 2-3 short paragraphs). Bold the names of any matched criminals or case IDs. If there are no matches, state that no immediate patterns were found.`;

        const result = await model.generateContent(prompt);
        res.json({ insights: result.response.text() });
    } catch (err) {
        console.error('AI Analyze Error:', err);
        res.status(500).json({ message: 'AI Analysis Failed: ' + err.message });
    }
});

module.exports = router;
