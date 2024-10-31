import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const socket = io(import.meta.env.VITE_SOCKET_SERVER_URL) // Configure WebSocket URL in .env file

function App() {
  const [gameResult, setGameResult] = useState<string | null>(null)
  const [sessionCode, setSessionCode] = useState<string>('')
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [rolls, setRolls] = useState<{[key: string]: number}>({});
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [isInSession, setIsInSession] = useState(false)
  const [playerCount, setPlayerCount] = useState(0)

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

    socket.on('game-result', ({ winner, highestRoll, rolls }) => {
      const resultMessage = winner === socket.id 
        ? `You won with ${highestRoll}!` 
        : `Opponent won with ${highestRoll}!`;
      setGameResult(resultMessage);
      setRolls(rolls);
      setWaitingForOpponent(false);
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
  }, [])

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

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="w-96 flex flex-col gap-4 items-center">
        <h1 className="text-2xl font-bold mb-4">D20 Roller</h1>
        
        {!isInSession && (
          <div className="flex flex-col gap-4 w-full items-center">
            <button className="border rounded  p-1 text-start px-2 font-bold" onClick={handleCreateSession}>Start a session</button>
            <button className="border rounded  p-1 px-2 text-start font-bold" onClick={handleJoinSession}>Join a session</button>
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
              className={`border rounded p-1 px-2 font-bold my-4 ${playerCount < 2 ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          {gameResult && <p>{gameResult}</p>}
        </div>
      </div>
    </div>
  )
}

export default App
