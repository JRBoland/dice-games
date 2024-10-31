import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_SOCKET_SERVER_URL); // Configure WebSocket URL in .env file

function App() {
  const [gameResult, setGameResult] = useState<string | null>(null);

  useEffect(() => {
    socket.on('game-result', (result) => {
      setGameResult(result);
    });

    return () => {
      socket.off('game-result');
    };
  }, []);

  return (
    <div>
      <h1>Dice Roller</h1>
      <input placeholder="Enter code" />
      <button>Start a session</button>
      <button>Join a session</button>
      <button>Roll</button>
      {gameResult && <p>Game Result: {gameResult}</p>}
    </div>
  );
}

export default App;
