const mongoose = require('mongoose');

const criminalSchema = new mongoose.Schema({
    criminalId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['Wanted', 'Arrested'], required: true },
    crimes: { type: String, required: true },
    photoIcon: { type: String, default: '👤' }
});

module.exports = mongoose.model('Criminal', criminalSchema);
