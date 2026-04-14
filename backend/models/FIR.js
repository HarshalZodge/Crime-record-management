const mongoose = require('mongoose');

const firSchema = new mongoose.Schema({
    firNo: { type: String, required: true, unique: true },
    time: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FIR', firSchema);
