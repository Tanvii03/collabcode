// server/sockets/editorSocket.js
// Attach this to your Socket.io server instance

// Note: Make sure your Room model is imported somewhere if you haven't already, 
// since saveSnapshot uses it!
// const Room = require('../models/Room'); 

const rooms = new Map(); // roomId → { code, users: Map<socketId, { id, name, role }> }

module.exports = function registerEditorEvents(io) {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // ── Join a room ──────────────────────────────────────────────────────────
    socket.on("join-room", ({ roomId, user, role }) => {
      socket.join(roomId);

      // Initialise room state if first user
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          code: "// Start coding here...\n",
          language: "javascript",
          users: new Map(),
        });
      }

      const room = rooms.get(roomId);
      room.users.set(socket.id, { ...user, role });

      // Send the current code snapshot to the joining user
      socket.emit("code-update", {
        newCode: room.code,
        senderId: "server",
      });

      // Notify everyone else someone joined
      socket.to(roomId).emit("user-joined", {
        userId: socket.id,
        userName: user.name,
        role,
      });
    });

    // ── Code changed (host typing in editor) ────────────────────────────────
    socket.on("code-change", ({ roomId, newCode, senderId }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      // Only host can broadcast live code changes
      const user = room.users.get(socket.id);
      if (user?.role !== "host") return;

      room.code = newCode; // persist in memory (save to DB periodically)

      // Broadcast to everyone else in the room
      socket.to(roomId).emit("code-update", { newCode, senderId });
    });

    // ── Host explicitly pushes notes/solution to peers ───────────────────────
    socket.on("host-push", ({ roomId, content }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (user?.role !== "host") return; // security: only host can push

      room.code = content;

      // Broadcast ONLY to peers (not back to host)
      socket.to(roomId).emit("host-push", { content });
    });

    // ── Cursor moved ─────────────────────────────────────────────────────────
    socket.on("cursor-move", ({ roomId, userId, userName, position }) => {
      // Broadcast to all others in room (not sender)
      socket.to(roomId).emit("cursor-update", { userId, userName, position });
    });

    // ── Language changed by host ─────────────────────────────────────────────
    socket.on("language-change", ({ roomId, lang }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const user = room.users.get(socket.id);
      if (user?.role !== "host") return;

      room.language = lang;
      io.to(roomId).emit("language-change", { lang }); // tell everyone including host
    });

    // ── WebRTC Video Calling Events ──────────────────────────────────────────
    // User wants to start a video call
    socket.on('call-user', ({ roomId, offer }) => {
      socket.to(roomId).emit('incoming-call', {
        from: socket.id,
        offer,
      });
    });

    // User accepted and sends back an answer
    socket.on('call-accepted', ({ to, answer }) => {
      io.to(to).emit('call-accepted', { answer });
    });

    // ICE candidates (network path info)
    socket.on('ice-candidate', ({ roomId, candidate }) => {
      socket.to(roomId).emit('ice-candidate', { candidate });
    });

    // ── Periodic code save to MongoDB (every 30s) ────────────────────────────
    // Call this from a setInterval or on disconnect
    async function saveSnapshot(roomId) {
      const room = rooms.get(roomId);
      if (!room) return;
      try {
        await Room.findOneAndUpdate(
          { roomId },
          { latestCode: room.code, language: room.language },
          { upsert: true }
        );
      } catch (err) {
        console.error("Snapshot save failed:", err);
      }
    }

    // ── User disconnects ─────────────────────────────────────────────────────
    socket.on("disconnecting", () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue; // skip personal room

        const room = rooms.get(roomId);
        if (!room) continue;

        const user = room.users.get(socket.id);
        room.users.delete(socket.id);

        // Notify peers this user left
        socket.to(roomId).emit("user-left", {
          userId: socket.id,
          userName: user?.name,
        });

        // Clean up empty rooms
        if (room.users.size === 0) {
          saveSnapshot(roomId); // final save before cleanup
          rooms.delete(roomId);
        }
      }
    });

    socket.on("leave-room", ({ roomId }) => {
      socket.leave(roomId);
    });
  });
};