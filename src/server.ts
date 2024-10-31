import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173", // Your frontend URL
    methods: ["GET", "POST"]
  }
});

// In-memory storage
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('create-session', () => {
    const sessionCode = uuidv4().substring(0, 6); // Generate shorter code
    sessions.set(sessionCode, {
      players: [socket.id],
      lastRoll: null
    });
    
    socket.join(sessionCode);
    socket.emit('session-created', sessionCode);
  });

  socket.on('join-session', (sessionCode) => {
    const session = sessions.get(sessionCode);
    
    if (!session) {
      socket.emit('error', 'Session not found');
      return;
    }

    session.players.push(socket.id);
    socket.join(sessionCode);
    socket.emit('session-joined', `Joined session ${sessionCode}`);
  });

  socket.on('roll-dice', (sessionCode) => {
    const session = sessions.get(sessionCode);
    
    if (!session) {
      socket.emit('error', 'Session not found');
      return;
    }

    const result = Math.floor(Math.random() * 6) + 1;
    session.lastRoll = result;
    
    // Broadcast to all players in the session
    io.to(sessionCode).emit('game-result', result);
  });

  socket.on('disconnect', () => {
    // Clean up sessions when players disconnect
    sessions.forEach((session, code) => {
      session.players = session.players.filter((id: string) => id !== socket.id);
      if (session.players.length === 0) {
        sessions.delete(code);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 