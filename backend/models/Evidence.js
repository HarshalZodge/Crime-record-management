const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
    title: { type: String, required: true },
    caseId: { type: String, required: true },
    type: { type: String, enum: ['Physical', 'Digital', 'Forensic'], required: true },
    status: { type: String, required: true }
});

module.exports = mongoose.model('Evidence', evidenceSchema);
