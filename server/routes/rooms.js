const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');

// Install uuid first: npm install uuid

// Create a new room
router.post('/create', async (req, res) => {
  try {
    const roomId = uuidv4().slice(0, 8); // short 8-char room code
    const room = await Room.create({ roomId, hostId: req.body.userId });
    res.json({ roomId: room.roomId });
  } catch (err) {
    res.status(500).json({ msg: 'Could not create room' });
  }
});

// Get room details
router.get('/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ msg: 'Room not found' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;