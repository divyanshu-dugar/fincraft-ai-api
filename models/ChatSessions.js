const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sessionName: {
        type: String, 
        default: 'New Conversation'
    }
}, { timestamps: true});

module.exports = mongoose.model('ChatSession', chatSessionSchema);