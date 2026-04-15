// server/models/Note.js
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  userId: { type: String, required: true },
  notes: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

// Compound index so each user has one note doc per room
noteSchema.index({ roomId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Note', noteSchema);