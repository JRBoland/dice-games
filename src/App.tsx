import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const socket = io(import.meta.env.VITE_SOCKET_SERVER_URL) // Configure WebSocket URL in .env file

function App() {
  const [gameResult, setGameResult] = useState<string | null>(null)
  const [sessionCode, setSessionCode] = useState<string>('')

  useEffect(() => {
    // Listen for game events
    socket.on('game-result', (result) => {
      setGameResult(result)
    })

    socket.on('session-created', (code) => {
      setSessionCode(code)
      console.log('Session created with code:', code)
    })

    socket.on('session-joined', (message) => {
      console.log('Joined session:', message)
    })

    socket.on('error', (error) => {
      console.error('Socket error:', error)
    })

    // Cleanup listeners
    return () => {
      socket.off('game-result')
      socket.off('session-created')
      socket.off('session-joined')
      socket.off('error')
    }
  }, [])

  const handleCreateSession = () => {
    socket.emit('create-session')
  }

  const handleJoinSession = () => {
    socket.emit('join-session', sessionCode)
  }

  const handleRollDice = () => {
    socket.emit('roll-dice', sessionCode)
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="flex flex-col gap-4 items-start my-4">
        <h1 className="text-2xl font-bold">Dice Roller</h1>
        <input 
          className="border" 
          placeholder="Enter code" 
          value={sessionCode}
          onChange={(e) => setSessionCode(e.target.value)}
        />
        <button onClick={handleCreateSession}>Start a session</button>
        <button onClick={handleJoinSession}>Join a session</button>
        <button onClick={handleRollDice}>Roll</button>
      </div>
      {gameResult && <p>Game Result: {gameResult}</p>}
    </div>
  )
}

export default App
