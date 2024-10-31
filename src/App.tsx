import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const socket = io(import.meta.env.VITE_SOCKET_SERVER_URL) // Configure WebSocket URL in .env file

interface GifResult {
  winner?: string[];
  loser?: string[];
  critical?: string[];
}

function App() {
  const [gameResult, setGameResult] = useState<string | null>(null)
  const [sessionCode, setSessionCode] = useState<string>('')
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [rolls, setRolls] = useState<{[key: string]: number}>({});
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [isInSession, setIsInSession] = useState(false)
  const [playerCount, setPlayerCount] = useState(0)
  const [gifs, setGifs] = useState<GifResult>({});

  // Add Giphy API key
  const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;

  useEffect(() => {
    // Listen for game events
    socket.on('game-result', (result) => {
      setGameResult(result)
    })

    socket.on('session-created', (code) => {
      setSessionCode(code)
      setIsInSession(true)
      setPlayerCount(1)
      console.log('Session created with code:', code)
    })

    socket.on('session-joined', (message) => {
      setIsInSession(true)
      setPlayerCount(2)
      console.log('Joined session:', message)
    })

    socket.on('player-joined', () => {
      setPlayerCount(2)
      console.log('Player joined, session ready!')
    })

    socket.on('error', (error) => {
      console.error('Socket error:', error)
    })

    socket.on('player-rolled', ({ socketId, rolls }) => {
      setRolls(rolls);
      setWaitingForOpponent(socketId === socket.id);
    });

    socket.on('game-result', async ({ winner, highestRoll, rolls }) => {
      const isWinner = winner === socket.id;
      const myRoll = socket.id ? rolls[socket.id] : undefined;
      
      const resultMessage = isWinner 
        ? `You won with ${highestRoll}!` 
        : `Opponent won with ${highestRoll}!`;
      
      setGameResult(resultMessage);
      setRolls(rolls);
      setWaitingForOpponent(false);

      // Fetch appropriate GIFs
      const gameGifs = await fetchGameGifs(isWinner, myRoll);
      setGifs(prev => ({
        ...prev,
        [isWinner ? 'winner' : 'loser']: gameGifs
      }));
    });

    // Cleanup listeners
    return () => {
      socket.off('game-result')
      socket.off('session-created')
      socket.off('session-joined')
      socket.off('error')
      socket.off('player-rolled')
      socket.off('player-joined')
    }
  })

  const handleCreateSession = () => {
    setShowJoinInput(false)
    socket.emit('create-session')
  }

  const handleJoinSession = () => {
    if (!showJoinInput) {
      setShowJoinInput(true)
    }
  }

  const handleJoinSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (sessionCode) {
      socket.emit('join-session', sessionCode)
      setShowJoinInput(false)
    }
  }

  const handleRollDice = () => {
    socket.emit('roll-dice', sessionCode)
  }

  const handleReset = () => {
    // Reset all state
    setGameResult(null);
    setSessionCode('');
    setWaitingForOpponent(false);
    setRolls({});
    setShowJoinInput(false);
    setIsInSession(false);
    setPlayerCount(0);

    // Disconnect and reconnect socket
    socket.disconnect();
    socket.connect();

    setGifs({});
  };

  const fetchGif = async (searchTerm: string) => {
    try {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${searchTerm}&limit=10&rating=g`
      );
      const data = await response.json();
      // Get random GIF from results
      const randomIndex = Math.floor(Math.random() * Math.min(data.data.length, 10));
      return data.data[randomIndex]?.images.fixed_height.url;
    } catch (error) {
      console.error('Error fetching GIF:', error);
      return null;
    }
  };

  const fetchGameGifs = async (isWinner: boolean, roll: number) => {
    const newGifs: string[] = [];
    
    // Fetch main result GIF
    const mainGif = await fetchGif(isWinner ? 'winner' : 'loser');
    if (mainGif) newGifs.push(mainGif);
    
    // Fetch critical GIF if applicable
    if (roll === 20 && isWinner) {
      const criticalGif = await fetchGif('critical success');
      if (criticalGif) newGifs.push(criticalGif);
    } else if (roll === 1 && !isWinner) {
      const criticalGif = await fetchGif('critical failure');
      if (criticalGif) newGifs.push(criticalGif);
    }
    
    return newGifs;
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="w-96 flex flex-col gap-4 items-center">
        <div className="flex justify-center mb-8 w-full items-center min-h-[40px]">
          {!isInSession && <h1 className="text-2xl font-bold">D20 Roller</h1>}
          
        </div>
        
        {!isInSession && (
          <div className="flex flex-col gap-4 w-full items-center">
            {!showJoinInput && (
              <>
                <button className="border rounded p-1 text-start px-2 font-bold" onClick={handleCreateSession}>Start a session</button>
                <button className="border rounded p-1 px-2 text-start font-bold" onClick={handleJoinSession}>Join a session</button>
              </>
            )}
            {showJoinInput && (
              <form onSubmit={handleJoinSubmit} className="flex gap-2 flex-col w-32">
                <input 
                  className="border rounded p-1 px-2 text-start" 
                  placeholder="Enter code" 
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value)}
                  autoFocus
                />
                <button className="border rounded p-1 px-2 font-bold" type="submit">Join</button>
              </form>
            )}
          </div>
        )}

        {isInSession && (
          <div className="flex flex-col gap-4 items-center min-h-[120px] justify-center">
            {playerCount === 1 ? (
              <div className="flex flex-col gap-2 items-center text-center">
                <p>Share this code with your opponent:</p>
                <p className="font-bold text-xl">{sessionCode}</p>
                <p className="italic">Waiting for opponent to join...</p>
              </div>
            ) : (
              <p>Game ready! Roll when you want to play!</p>
            )}
            <button 
              onClick={handleRollDice}
              disabled={playerCount < 2}
              className={`border rounded p-1 px-2 font-bold my-4 min-w-24 ${playerCount < 2 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Roll
            </button>
          </div>
        )}

        <div className="mt-4 min-h-[60px] text-center">
          {Object.entries(rolls).map(([playerId, roll]) => (
            <p key={playerId}>
              {playerId === socket.id ? 'You' : 'Opponent'} rolled: {roll}
            </p>
          ))}
          {waitingForOpponent && (
            <p>Waiting for opponent to roll...</p>
          )}
          {gameResult && (
            <div className="flex flex-col items-center gap-4">
              <p>{gameResult}</p>
              {gifs.winner && (
                <div className="flex flex-col gap-2">
                  {gifs.winner.map((gif, index) => (
                    <img 
                      key={index} 
                      src={gif} 
                      alt="Winner GIF" 
                      className="max-w-xs rounded-lg shadow-lg"
                    />
                  ))}
                </div>
              )}
              {gifs.loser && (
                <div className="flex flex-col gap-2">
                  {gifs.loser.map((gif, index) => (
                    <img 
                      key={index} 
                      src={gif} 
                      alt="Loser GIF" 
                      className="max-w-xs rounded-lg shadow-lg"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          <button 
            onClick={handleReset}
            className="border rounded p-1 px-2 font-bold mt-4"
          >
            Reset
          </button>
        </div>
        
      </div>
    </div>
  )
}

export default App
