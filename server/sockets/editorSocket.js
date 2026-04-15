// server/sockets/editorSocket.js
const Room = require('../models/Room');
const Note = require('../models/Note');

// In-memory store: roomId -> { code, language, users: Map, pendingPeers: Map }
const rooms = new Map();

module.exports = function registerEditorEvents(io) {
  io.on('connection', (socket) => {

    // 1. HOST joins room directly
    socket.on('join-room-host', ({ roomId, user }) => {
      socket.join(roomId);
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          code: '// Start coding here...\n',
          language: 'javascript',
          users: new Map(),
          pendingPeers: new Map(),
        });
      }
      const room = rooms.get(roomId);
      room.users.set(socket.id, { ...user, role: 'host' });
      socket.emit('code-update', { newCode: room.code, senderId: 'server' });
      socket.emit('joined-room', { role: 'host', roomId });

      // Load saved code from DB
      Room.findOne({ roomId }).then(saved => {
        if (saved?.latestCode) {
          room.code = saved.latestCode;
          socket.emit('code-update', { newCode: saved.latestCode, senderId: 'server' });
        }
      });
    });

    // 2. PEER requests to join — goes to waiting room
    socket.on('request-join', ({ roomId, user }) => {
      if (!rooms.has(roomId)) {
        socket.emit('join-error', { msg: 'Room does not exist. Check the room code.' });
        return;
      }
      const room = rooms.get(roomId);
      const hostEntry = [...room.users.entries()].find(([, u]) => u.role === 'host');
      if (!hostEntry) {
        socket.emit('join-error', { msg: 'Host has not joined yet. Please wait and try again.' });
        return;
      }
      room.pendingPeers.set(socket.id, { ...user, socketId: socket.id });
      const [hostSocketId] = hostEntry;
      io.to(hostSocketId).emit('peer-requesting', {
        peerId: socket.id,
        peerName: user.name,
        peerUserId: user.id,
      });
      socket.emit('waiting-for-host', { msg: 'Waiting for the host to accept you...' });
    });

    // 3. HOST accepts a peer
    socket.on('accept-peer', ({ roomId, peerSocketId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const pendingPeer = room.pendingPeers.get(peerSocketId);
      if (!pendingPeer) return;
      room.pendingPeers.delete(peerSocketId);
      room.users.set(peerSocketId, { ...pendingPeer, role: 'peer' });
      const peerSocket = io.sockets.sockets.get(peerSocketId);
      if (peerSocket) {
        peerSocket.join(roomId);
        peerSocket.emit('code-update', { newCode: room.code, senderId: 'server' });
        peerSocket.emit('joined-room', { role: 'peer', roomId });
      }
      io.to(roomId).emit('user-joined', {
        userId: pendingPeer.id,
        userName: pendingPeer.name,
        role: 'peer',
        socketId: peerSocketId,
      });
      socket.emit('peer-accepted-confirm', { peerName: pendingPeer.name, peerSocketId });
    });

    // 4. HOST rejects a peer
    socket.on('reject-peer', ({ roomId, peerSocketId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const pendingPeer = room.pendingPeers.get(peerSocketId);
      room.pendingPeers.delete(peerSocketId);
      io.to(peerSocketId).emit('join-rejected', {
        msg: 'The host has declined your request to join.',
      });
    });

    // 5. Code changed — host types in editor, sync to peers
    socket.on('code-change', ({ roomId, newCode }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      room.code = newCode;
      socket.to(roomId).emit('code-update', { newCode, senderId: socket.id });
    });

    // 6. Host pushes solution to peers
    socket.on('host-push', ({ roomId, content }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const user = room.users.get(socket.id);
      if (!user || user.role !== 'host') return;
      room.code = content;
      socket.to(roomId).emit('host-push', { content });
    });

    // 7. Cursor position broadcast
    socket.on('cursor-move', ({ roomId, userId, userName, position }) => {
      socket.to(roomId).emit('cursor-update', { userId, userName, position });
    });

    // 8. Language change (host only)
    socket.on('language-change', ({ roomId, lang }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      room.language = lang;
      io.to(roomId).emit('language-change', { lang });
    });

    // 9. Save private notes
    socket.on('save-notes', async ({ roomId, userId, notes }) => {
      try {
        await Note.findOneAndUpdate(
          { roomId, userId },
          { notes, updatedAt: new Date() },
          { upsert: true, new: true }
        );
        socket.emit('notes-saved', { msg: 'Notes saved successfully!' });
      } catch (err) {
        socket.emit('notes-save-error', { msg: 'Failed to save notes.' });
      }
    });

    // 10. Load private notes
    socket.on('load-notes', async ({ roomId, userId }) => {
      try {
        const note = await Note.findOne({ roomId, userId });
        socket.emit('notes-loaded', { notes: note?.notes || '' });
      } catch (err) {
        socket.emit('notes-loaded', { notes: '' });
      }
    });

    // 11. Delete room history (host only)
    socket.on('delete-room-history', async ({ roomId, userId }) => {
      try {
        await Room.findOneAndUpdate(
          { roomId },
          { latestCode: '// Start coding here...\n' }
        );
        await Note.deleteMany({ roomId, userId });
        const room = rooms.get(roomId);
        if (room) room.code = '// Start coding here...\n';
        socket.emit('history-deleted', { msg: 'Room history and notes cleared.' });
        io.to(roomId).emit('code-update', {
          newCode: '// Start coding here...\n',
          senderId: 'server',
        });
      } catch (err) {
        socket.emit('history-delete-error', { msg: 'Could not clear history.' });
      }
    });

    // 12. WebRTC signalling — offer
    socket.on('webrtc-offer', ({ roomId, offer, targetSocketId }) => {
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc-offer', { offer, fromSocketId: socket.id });
      } else {
        socket.to(roomId).emit('webrtc-offer', { offer, fromSocketId: socket.id });
      }
    });

    // 13. WebRTC signalling — answer
    socket.on('webrtc-answer', ({ answer, targetSocketId }) => {
      io.to(targetSocketId).emit('webrtc-answer', { answer, fromSocketId: socket.id });
    });

    // 14. WebRTC ICE candidates
    socket.on('webrtc-ice-candidate', ({ roomId, candidate, targetSocketId }) => {
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc-ice-candidate', { candidate, fromSocketId: socket.id });
      } else {
        socket.to(roomId).emit('webrtc-ice-candidate', { candidate, fromSocketId: socket.id });
      }
    });

    // 15. Leave room manually
    socket.on('leave-room', ({ roomId }) => {
      handleLeave(socket, roomId, io);
    });

    // 16. Auto-cleanup on disconnect
    socket.on('disconnecting', () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue;
        handleLeave(socket, roomId, io);
      }
    });

  });
};

function handleLeave(socket, roomId, io) {
  const room = rooms.get(roomId);
  if (!room) return;
  const user = room.users.get(socket.id);
  room.users.delete(socket.id);
  room.pendingPeers.delete(socket.id);
  if (user) {
    saveSnapshot(roomId, room.code, room.language);
    socket.to(roomId).emit('user-left', {
      userId: socket.id,
      userName: user.name,
      role: user.role,
    });
    if (user.role === 'host') {
      io.to(roomId).emit('host-left', { msg: 'The host has left the room.' });
    }
  }
  if (room.users.size === 0) rooms.delete(roomId);
  socket.leave(roomId);
}

async function saveSnapshot(roomId, code, language) {
  try {
    await Room.findOneAndUpdate(
      { roomId },
      { latestCode: code, language },
      { upsert: true }
    );
  } catch (err) {
    console.error('Snapshot save failed:', err.message);
  }
}