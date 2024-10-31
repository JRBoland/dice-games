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
  settings: GameSettings;
  isComplete?: boolean;
}

interface GameSettings {
  mode: 'vs' | 'check';
  targetNumber?: number;
  maxRerolls?: number;
  remainingRerolls?: number;
}

const sessions: { [code: string]: GameSession } = {};

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('create-session', (settings: GameSettings) => {
    const sessionCode = Math.floor(1000 + Math.random() * 9000).toString();
    sessions[sessionCode] = {
      rolls: {},
      players: [socket.id],
      settings
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
    socket.emit('session-joined', { sessionCode, players: session.players });
    socket.emit('game-settings-updated', session.settings);
    io.to(sessionCode).emit('player-joined', { players: session.players });
  });

  socket.on('roll-dice', (sessionCode) => {
    const session = sessions[sessionCode];
    
    if (!session) {
      socket.emit('error', 'Session not found');
      return;
    }

    if (session.settings.mode !== 'vs') {
      socket.emit('error', 'Wrong game mode');
      return;
    }

    if (session.rolls[socket.id]) {
      socket.emit('error', 'You have already rolled');
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

  socket.on('check-roll', (sessionCode) => {
    const session = sessions[sessionCode];
    
    if (!session) {
      socket.emit('error', 'Session not found');
      return;
    }

    if (session.players[0] === socket.id) {
      socket.emit('error', 'Only the challenger can roll');
      return;
    }

    if (session.isComplete || (session.settings.remainingRerolls !== undefined && session.settings.remainingRerolls < 0)) {
      socket.emit('error', 'Session is complete');
      return;
    }

    const rollValue = Math.floor(Math.random() * 20) + 1;
    session.rolls[socket.id] = rollValue;

    const targetNumber = session.settings.targetNumber!;
    const success = rollValue >= targetNumber;
    
    if (session.settings.remainingRerolls === undefined) {
      session.settings.remainingRerolls = session.settings.maxRerolls ?? 0;
    }

    if (success) {
      session.isComplete = true;
      io.to(sessionCode).emit('check-result', {
        success: true,
        roll: rollValue,
        remainingRerolls: session.settings.remainingRerolls,
        playerId: socket.id,
        players: session.players,
        isComplete: true
      });
      
      session.rolls = {};
      session.settings.remainingRerolls = session.settings.maxRerolls;
    } else {
      session.settings.remainingRerolls--;
      
      const isOutOfRerolls = session.settings.remainingRerolls < 0;
      if (isOutOfRerolls) {
        session.isComplete = true;
      }

      io.to(sessionCode).emit('check-result', {
        success: false,
        roll: rollValue,
        remainingRerolls: session.settings.remainingRerolls,
        playerId: socket.id,
        players: session.players,
        isComplete: isOutOfRerolls
      });

      if (isOutOfRerolls) {
        session.rolls = {};
        session.settings.remainingRerolls = session.settings.maxRerolls;
      }
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