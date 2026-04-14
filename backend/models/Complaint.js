const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
    citizenId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    incidentDate: { type: Date, required: true },
    status: { type: String, enum: ['Pending', 'Under Investigation', 'Resolved', 'Rejected', 'Converted to FIR'], default: 'Pending' },
    filedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Complaint', complaintSchema);
