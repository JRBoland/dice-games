import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

interface GameSession {
  rolls: { [socketId: string]: number };
  players: string[];
}

const sessions: { [code: string]: GameSession } = {};

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('create-session', () => {
    const sessionCode = Math.floor(1000 + Math.random() * 9000).toString();
    sessions[sessionCode] = {
      rolls: {},
      players: [socket.id]
    };
    socket.join(sessionCode);
    socket.emit('session-created', sessionCode);
  });

  socket.on('join-session', (sessionCode) => {
    const session = sessions[sessionCode];
    
    if (!session) {
      socket.emit('error', 'Session not found');
      return;
    }

    if (session.players.length >= 2) {
      socket.emit('error', 'Session is full');
      return;
    }

    session.players.push(socket.id);
    socket.join(sessionCode);
    socket.emit('session-joined', `Joined session ${sessionCode}`);
    socket.to(sessionCode).emit('player-joined');
  });

  socket.on('roll-dice', (sessionCode) => {
    const session = sessions[sessionCode];
    
    if (!session) {
      socket.emit('error', 'Session not found');
      return;
    }

    const rollValue = Math.floor(Math.random() * 20) + 1;
    session.rolls[socket.id] = rollValue;

    io.to(sessionCode).emit('player-rolled', {
      socketId: socket.id,
      value: rollValue,
      rolls: session.rolls
    });

    if (Object.keys(session.rolls).length === 2) {
      const rolls = Object.entries(session.rolls);
      const winner = rolls.reduce((a, b) => a[1] > b[1] ? a : b);
      
      io.to(sessionCode).emit('game-result', {
        rolls: session.rolls,
        winner: winner[0],
        highestRoll: winner[1]
      });
      
      session.rolls = {};
    }
  });

  socket.on('disconnect', () => {
    // Clean up sessions when players disconnect
    Object.keys(sessions).forEach((code) => {
      sessions[code].players = sessions[code].players.filter(id => id !== socket.id);
      if (sessions[code].players.length === 0) {
        delete sessions[code];
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 