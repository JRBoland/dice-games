import { useEffect, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const socket = io(import.meta.env.VITE_SOCKET_SERVER_URL) // Configure WebSocket URL in .env file

interface GifResult {
  winner?: string[];
  loser?: string[];
  critical?: string[];
}

interface GameSettings {
  mode: 'vs' | 'check';
  targetNumber?: number;
  maxRerolls?: number;
  remainingRerolls?: number;
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
  const [gameSettings, setGameSettings] = useState<GameSettings>({ mode: 'vs' });
  const [showGameModeSelect, setShowGameModeSelect] = useState(false);
  const [showCheckSettings, setShowCheckSettings] = useState(false);
  const [sessionPlayers, setSessionPlayers] = useState<string[]>([]);
  const [isChallenger, setIsChallenger] = useState(false);

  // Add Giphy API key
  const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;

  const fetchGif = useCallback(async (searchTerm: string) => {
    try {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${searchTerm}&limit=10&rating=g`
      );
      const data = await response.json();
      const randomIndex = Math.floor(Math.random() * Math.min(data.data.length, 10));
      return data.data[randomIndex]?.images.fixed_height.url;
    } catch (error) {
      console.error('Error fetching GIF:', error);
      return null;
    }
  }, [GIPHY_API_KEY]);

  const fetchGameGifs = useCallback(async (isWinner: boolean, roll: number) => {
    const newGifs: string[] = [];
    
    const mainGif = await fetchGif(isWinner ? 'winner' : 'loser');
    if (mainGif) newGifs.push(mainGif);
    
    if (roll === 20 && isWinner) {
      const criticalGif = await fetchGif('critical success');
      if (criticalGif) newGifs.push(criticalGif);
    } else if (roll === 1 && !isWinner) {
      const criticalGif = await fetchGif('critical failure');
      if (criticalGif) newGifs.push(criticalGif);
    }
    
    return newGifs;
  }, [fetchGif]);

  useEffect(() => {
    // Listen for game events
    socket.on('game-result', (result) => {
      setGameResult(result)
    })

    socket.on('session-created', (code) => {
      setSessionCode(code)
      setIsInSession(true)
      setPlayerCount(1)
      setGameSettings(prev => ({ ...prev }))
      console.log('Session created with code:', code)
    })

    socket.on('session-joined', (message) => {
      setIsInSession(true)
      setPlayerCount(2)
      setSessionPlayers(message.players)
      setIsChallenger(true)
      console.log('Joined session:', message)
    })

    socket.on('player-joined', () => {
      setPlayerCount(2)
      console.log('Received player-joined event')
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
      if (socket.id != null) {
        setRolls(prev => ({ ...prev, [socket.id as string]: myRoll }));
      }
      setWaitingForOpponent(false);

      // Fetch appropriate GIFs
      const gameGifs = await fetchGameGifs(isWinner, myRoll);
      setGifs(prev => ({
        ...prev,
        [isWinner ? 'winner' : 'loser']: gameGifs
      }));
    });

    socket.on('game-settings-updated', (settings: GameSettings) => {
      console.log('Received game settings:', settings)
      setGameSettings(settings)
      setIsInSession(true)
    });

    socket.on('check-result', async ({ success, roll, remainingRerolls, playerId }) => {
      const isChallenger = socket.id === sessionPlayers[1];  // Challenger is player[1]
      const resultMessage = isChallenger 
        ? `You rolled ${roll}${success 
            ? ` - Success vs target ${gameSettings.targetNumber}!`
            : remainingRerolls > 0 
              ? `. ${remainingRerolls} rerolls remaining.`
              : ` - Failed vs target ${gameSettings.targetNumber}.`}`
        : `Challenger rolled ${roll}${success
            ? ` - Success vs target ${gameSettings.targetNumber}!`
            : remainingRerolls > 0
              ? `. ${remainingRerolls} rerolls remaining.`
              : ` - Failed vs target ${gameSettings.targetNumber}.`}`;
      
      setGameResult(resultMessage);
      setRolls(prev => ({ ...prev, [playerId]: roll }));
      
      if (success || remainingRerolls === 0) {
        const gameGifs = await fetchGameGifs(success, roll);
        setGifs(prev => ({
          ...prev,
          [success ? 'winner' : 'loser']: gameGifs
        }));
      }
    });

    // Cleanup listeners
    return () => {
      socket.off('game-result')
      socket.off('session-created')
      socket.off('session-joined')
      socket.off('error')
      socket.off('player-rolled')
      socket.off('player-joined')
      socket.off('game-settings-updated');
      socket.off('check-result');
    }
  }, [fetchGameGifs, gameSettings.targetNumber]);

  const handleCreateSession = () => {
    setShowJoinInput(false);
    setShowGameModeSelect(true);
  };

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
    if (gameSettings.mode === 'vs') {
      socket.emit('roll-dice', sessionCode);
    } else {
      socket.emit('check-roll', sessionCode);
    }
  };

  const handleReset = () => {
    // Reset all state
    setGameResult(null);
    setSessionCode('');
    setWaitingForOpponent(false);
    setRolls({});
    setShowJoinInput(false);
    setIsInSession(false);
    setPlayerCount(0);
    setShowGameModeSelect(false);
    setShowCheckSettings(false);
    setGameSettings({ mode: 'vs' });

    // Disconnect and reconnect socket
    socket.disconnect();
    socket.connect();

    setGifs({});
  };

  const handleModeSelect = (mode: 'vs' | 'check') => {
    if (mode === 'vs') {
      setGameSettings({ mode: 'vs' });
      socket.emit('create-session', { mode: 'vs' });
    } else {
      setShowCheckSettings(true);
    }
    setShowGameModeSelect(false);
  };

  const handleCheckSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const settings: GameSettings = {
      mode: 'check',
      targetNumber: gameSettings.targetNumber,
      maxRerolls: gameSettings.maxRerolls,
      remainingRerolls: gameSettings.maxRerolls
    };
    socket.emit('create-session', settings);
    setShowCheckSettings(false);
  };

  console.log('Current socket.id:', socket.id);
  console.log('Session players:', sessionPlayers);
  console.log('Game settings:', gameSettings);

  console.log('Debug info:', {
    socketId: socket.id,
    sessionPlayers,
    isCreator: sessionPlayers[0] === socket.id,
    isChallenger: sessionPlayers[1] === socket.id,
    gameMode: gameSettings.mode,
    playerCount
  });

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="w-96 flex flex-col gap-4 items-center">
        <div className="flex justify-center mb-8 w-full items-center min-h-[40px]">
          {!isInSession && <h1 className="text-2xl font-bold">D20 Roller</h1>}
          {isInSession && (
            <div className="text-center">
              <h2 className="text-xl font-bold">
                Check Mode
              </h2>
              {gameSettings.mode === 'check' && gameSettings.targetNumber && (
                <div>
                  <p className="text-sm mt-1">Target: {gameSettings.targetNumber}</p>
                  {gameSettings.maxRerolls !== undefined && (
                    <p className="text-sm">Max Rerolls: {gameSettings.maxRerolls}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {!isInSession && (
          <div className="flex flex-col gap-4 w-full items-center">
            {!showJoinInput && !showGameModeSelect && !showCheckSettings && (
              <>
                <button className="border rounded p-1 text-start px-2 font-bold" onClick={handleCreateSession}>Start a session</button>
                <button className="border rounded p-1 px-2 text-start font-bold" onClick={handleJoinSession}>Join a session</button>
              </>
            )}
            
            {showGameModeSelect && (
              <div className="flex flex-col gap-2">
                <button className="border rounded p-1 px-2 font-bold" onClick={() => handleModeSelect('vs')}>VS Mode</button>
                <button className="border rounded p-1 px-2 font-bold" onClick={() => handleModeSelect('check')}>Check Mode</button>
              </div>
            )}

            {showCheckSettings && (
              <form onSubmit={handleCheckSettingsSubmit} className="flex flex-col gap-2">
                <input
                  type="number"
                  min="1"
                  max="20"
                  required
                  className="border rounded p-1 px-2"
                  placeholder="Target number (1-20)"
                  onChange={(e) => setGameSettings(prev => ({ ...prev, targetNumber: parseInt(e.target.value) }))}
                />
                <input
                  type="number"
                  min="0"
                  max="10"
                  required
                  className="border rounded p-1 px-2"
                  placeholder="Number of rerolls"
                  onChange={(e) => setGameSettings(prev => ({ ...prev, maxRerolls: parseInt(e.target.value) }))}
                />
                <button type="submit" className="border rounded p-1 px-2 font-bold">Create Game</button>
              </form>
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
              <>
                {/* Only show for VS mode or if we're the challenger in check mode */}
                {(gameSettings.mode === 'vs' || (gameSettings.mode === 'check' && isChallenger)) && (
                  <>
                    <p>Game ready! Roll when you want to play!</p>
                    <button 
                      onClick={handleRollDice}
                      disabled={playerCount < 2}
                      className={`border rounded p-1 px-2 font-bold my-4 min-w-24 ${playerCount < 2 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Roll
                    </button>
                  </>
                )}
              </>
            )}
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
