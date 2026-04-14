require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB...');

        const existing = await User.findOne({ username: 'admin' });
        if (existing) {
            console.log('⚠️  Admin user already exists. Skipping seed.');
            process.exit(0);
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

        console.log('');
        console.log('✅ Admin user created successfully!');
        console.log('   Username : admin');
        console.log('   Password : admin123');
        console.log('   Role     : admin');
        console.log('');
        console.log('⚠️  Change the password immediately after first login!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed failed:', err.message);
        process.exit(1);
    }
};

seed();
