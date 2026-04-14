const mongoose = require('mongoose');

const caseSchema = new mongoose.Schema({
    caseId: { type: String, required: true, unique: true },
    crimeType: { type: String, required: true },
    officer: { type: String, required: true },
    priority: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], required: true },
    status: { type: String, enum: ['Active', 'Solved', 'Cold'], default: 'Active' },
    description: { type: String },
    location: { type: String },
    date: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Case', caseSchema);
