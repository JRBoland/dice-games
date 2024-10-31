import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const socket = io(import.meta.env.VITE_SOCKET_SERVER_URL) // Configure WebSocket URL in .env file

function App() {
  const [gameResult, setGameResult] = useState<string | null>(null)

  useEffect(() => {
    socket.on('game-result', (result) => {
      setGameResult(result)
    })

    return () => {
      socket.off('game-result')
    }
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="flex flex-col gap-4 items-start my-4">
        <h1 className="text-2xl font-bold">Dice Roller</h1>
        <input className="border" placeholder="Enter code" />
        <button>Start a session</button>
        <button>Join a session</button>
        <button>Roll</button>
      </div>
      {gameResult && <p>Game Result: {gameResult}</p>}
    </div>
  )
}

export default App
