// server/sockets/editorSocket.js
// ─────────────────────────────────────────────────────────────────────────────
// CollabCode — Interview Room Socket Logic
//
// ROLES:
//   host  = Interviewer — watches candidate, sends hints, pushes solutions
//   peer  = Candidate   — writes code, receives hints and pushed solutions
//
// FLOW:
//   1. Host joins room directly
//   2. Peer sends join request → goes to waiting room
//   3. Host accepts/rejects peer
//   4. Both are in the room
//   5. Peer types → code syncs to host's read-only mirror
//   6. Host sends hint → popup appears on peer's screen
//   7. Host can push full solution to peer's editor
//   8. Host can save/load private notes (never visible to peer)
//   9. Both can leave; code snapshot saved to DB on leave
// ─────────────────────────────────────────────────────────────────────────────

const Room = require('../models/Room');
const Note = require('../models/Note');

// In-memory room store
// roomId → {
//   code: string,           — current candidate code
//   language: string,       — current language
//   users: Map<socketId, {id, name, role}>,
//   pendingPeers: Map<socketId, {id, name, socketId}>
// }
const rooms = new Map();

module.exports = function registerEditorEvents(io) {
  io.on('connection', (socket) => {

    // ── 1. HOST joins room ────────────────────────────────────────────────────
    socket.on('join-room-host', async ({ roomId, user }) => {
      socket.join(roomId);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          code: '// Candidate will write code here...\n',
          language: 'javascript',
          users: new Map(),
          pendingPeers: new Map(),
        });
      }

      const room = rooms.get(roomId);
      room.users.set(socket.id, { ...user, role: 'host' });

      // Load saved code from DB if exists
      try {
        const saved = await Room.findOne({ roomId });
        if (saved?.latestCode) room.code = saved.latestCode;
      } catch (e) { /* ignore */ }

      socket.emit('joined-room', { role: 'host', roomId });
      socket.emit('code-update', { newCode: room.code, senderId: 'server' });
      socket.emit('language-update', { lang: room.language });
    });

    // ── 2. PEER requests to join (waiting room) ───────────────────────────────
    socket.on('request-join', ({ roomId, user }) => {
      if (!rooms.has(roomId)) {
        socket.emit('join-error', { msg: 'Room not found. Check the room code.' });
        return;
      }

      const room = rooms.get(roomId);
      const hostEntry = [...room.users.entries()].find(([, u]) => u.role === 'host');

      if (!hostEntry) {
        socket.emit('join-error', { msg: 'Interviewer has not joined yet. Please wait.' });
        return;
      }

      room.pendingPeers.set(socket.id, { ...user, socketId: socket.id });

      // Notify host about waiting candidate
      const [hostSocketId] = hostEntry;
      io.to(hostSocketId).emit('peer-requesting', {
        peerId: socket.id,
        peerName: user.name,
        peerUserId: user.id,
      });

      socket.emit('waiting-for-host', {
        msg: 'Waiting for interviewer to admit you...',
      });
    });

    // ── 3. HOST accepts candidate ─────────────────────────────────────────────
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
        peerSocket.emit('joined-room', { role: 'peer', roomId });
        // Send current code snapshot to candidate
        peerSocket.emit('code-update', { newCode: room.code, senderId: 'server' });
        peerSocket.emit('language-update', { lang: room.language });
      }

      // Tell everyone in room a new candidate joined
      io.to(roomId).emit('user-joined', {
        userId: pendingPeer.id,
        userName: pendingPeer.name,
        role: 'peer',
        socketId: peerSocketId,
      });

      // Confirm to host
      socket.emit('peer-accepted-confirm', {
        peerName: pendingPeer.name,
        peerSocketId,
      });
    });

    // ── 4. HOST rejects candidate ─────────────────────────────────────────────
    socket.on('reject-peer', ({ roomId, peerSocketId }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const pendingPeer = room.pendingPeers.get(peerSocketId);
      room.pendingPeers.delete(peerSocketId);

      io.to(peerSocketId).emit('join-rejected', {
        msg: 'The interviewer has not admitted you to this session.',
      });
    });

    // ── 5. CANDIDATE types code → sync to everyone (host sees it live) ────────
    socket.on('code-change', ({ roomId, newCode }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (!user) return;

      // Update in-memory code
      room.code = newCode;

      // Broadcast to all others in room (host mirror updates, other peers too)
      socket.to(roomId).emit('code-update', {
        newCode,
        senderId: socket.id,
        senderName: user.name,
        senderRole: user.role,
      });
    });

    // ── 6. HOST sends a hint/suggestion to candidate ──────────────────────────
    socket.on('send-hint', ({ roomId, hint, hintType }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (!user || user.role !== 'host') return;

      // Send hint to all peers in the room
      socket.to(roomId).emit('hint-received', {
        hint,
        hintType: hintType || 'info', // 'info' | 'warning' | 'success'
        from: user.name,
        timestamp: new Date().toLocaleTimeString(),
      });
    });

    // ── 7. HOST pushes full solution/starter code to candidate ────────────────
    socket.on('host-push', ({ roomId, content }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (!user || user.role !== 'host') return;

      room.code = content;

      // Overwrite candidate's editor with this code
      socket.to(roomId).emit('host-push', { content });
    });

    // ── 8. Cursor position (candidate → host sees candidate's cursor) ─────────
    socket.on('cursor-move', ({ roomId, userId, userName, position }) => {
      socket.to(roomId).emit('cursor-update', { userId, userName, position });
    });

    // ── 9. Language change (host only) ────────────────────────────────────────
    socket.on('language-change', ({ roomId, lang }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      room.language = lang;
      io.to(roomId).emit('language-update', { lang });
    });

    // ── 10. Save host's private notes ─────────────────────────────────────────
    socket.on('save-notes', async ({ roomId, userId, notes }) => {
      try {
        await Note.findOneAndUpdate(
          { roomId, userId },
          { notes, updatedAt: new Date() },
          { upsert: true, new: true }
        );
        socket.emit('notes-saved', { msg: 'Notes saved!' });
      } catch (err) {
        socket.emit('notes-save-error', { msg: 'Could not save notes.' });
      }
    });

    // ── 11. Load host's private notes ─────────────────────────────────────────
    socket.on('load-notes', async ({ roomId, userId }) => {
      try {
        const note = await Note.findOne({ roomId, userId });
        socket.emit('notes-loaded', { notes: note?.notes || '' });
      } catch (err) {
        socket.emit('notes-loaded', { notes: '' });
      }
    });

    // ── 12. Update notes (same as save — upsert handles create + update) ──────
    // This is the UPDATE in CRUD — host edits notes and saves again
    socket.on('update-notes', async ({ roomId, userId, notes }) => {
      try {
        await Note.findOneAndUpdate(
          { roomId, userId },
          { notes, updatedAt: new Date() },
          { upsert: true, new: true }
        );
        socket.emit('notes-updated', { msg: 'Notes updated!' });
      } catch (err) {
        socket.emit('notes-update-error', { msg: 'Update failed.' });
      }
    });

    // ── 13. Update room code snapshot (READ and UPDATE in CRUD) ───────────────
    socket.on('save-code-snapshot', async ({ roomId, code, language }) => {
      try {
        await Room.findOneAndUpdate(
          { roomId },
          { latestCode: code, language },
          { upsert: true }
        );
        socket.emit('snapshot-saved', { msg: 'Code snapshot saved.' });
      } catch (err) {
        socket.emit('snapshot-save-error', { msg: 'Snapshot save failed.' });
      }
    });

    // ── 14. Get room details (READ in CRUD) ───────────────────────────────────
    socket.on('get-room-details', async ({ roomId }) => {
      try {
        const roomDoc = await Room.findOne({ roomId });
        socket.emit('room-details', { room: roomDoc });
      } catch (err) {
        socket.emit('room-details-error', { msg: 'Could not fetch room.' });
      }
    });

    // ── 15. Delete room history (DELETE in CRUD) ──────────────────────────────
    socket.on('delete-room-history', async ({ roomId, userId }) => {
      try {
        const freshCode = '// Candidate will write code here...\n';
        await Room.findOneAndUpdate({ roomId }, { latestCode: freshCode });
        await Note.deleteMany({ roomId, userId });

        const room = rooms.get(roomId);
        if (room) room.code = freshCode;

        // Reset everyone's editor
        io.to(roomId).emit('code-update', {
          newCode: freshCode,
          senderId: 'server',
        });

        socket.emit('history-deleted', { msg: 'Room history and notes cleared.' });
      } catch (err) {
        socket.emit('history-delete-error', { msg: 'Could not clear history.' });
      }
    });

    // ── 16. WebRTC — offer ────────────────────────────────────────────────────
    socket.on('webrtc-offer', ({ roomId, offer, targetSocketId }) => {
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc-offer', { offer, fromSocketId: socket.id });
      } else {
        socket.to(roomId).emit('webrtc-offer', { offer, fromSocketId: socket.id });
      }
    });

    // ── 17. WebRTC — answer ───────────────────────────────────────────────────
    socket.on('webrtc-answer', ({ answer, targetSocketId }) => {
      io.to(targetSocketId).emit('webrtc-answer', { answer, fromSocketId: socket.id });
    });

    // ── 18. WebRTC — ICE candidates ───────────────────────────────────────────
    socket.on('webrtc-ice-candidate', ({ roomId, candidate, targetSocketId }) => {
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc-ice-candidate', { candidate, fromSocketId: socket.id });
      } else {
        socket.to(roomId).emit('webrtc-ice-candidate', { candidate, fromSocketId: socket.id });
      }
    });

    // ── 19. Leave room ────────────────────────────────────────────────────────
    socket.on('leave-room', ({ roomId }) => {
      handleLeave(socket, roomId, io);
    });

    // ── 20. Auto-cleanup on disconnect ────────────────────────────────────────
    socket.on('disconnecting', () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue;
        handleLeave(socket, roomId, io);
      }
    });

  });
};

// ── Handle user leaving a room ────────────────────────────────────────────────
function handleLeave(socket, roomId, io) {
  const room = rooms.get(roomId);
  if (!room) return;

  const user = room.users.get(socket.id);
  room.users.delete(socket.id);
  room.pendingPeers.delete(socket.id);

  if (user) {
    // Save latest code to DB
    saveSnapshot(roomId, room.code, room.language);

    socket.to(roomId).emit('user-left', {
      userId: socket.id,
      userName: user.name,
      role: user.role,
    });

    if (user.role === 'host') {
      io.to(roomId).emit('host-left', {
        msg: 'The interviewer has ended the session.',
      });
    }
  }

  if (room.users.size === 0) rooms.delete(roomId);
  socket.leave(roomId);
}

// ── Save code snapshot to MongoDB ────────────────────────────────────────────
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
