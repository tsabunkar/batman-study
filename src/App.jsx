import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import batmanImg from '../batman_study.png'

const YOUTUBE_VIDEO_ID = 'ZkfZvz_2bPE'

// Visualizer bar config
const BARS = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  minH: Math.random() * 4 + 2,
  maxH: Math.random() * 24 + 8,
  duration: (Math.random() * 0.6 + 0.3).toFixed(2),
  delay: (Math.random() * 0.5).toFixed(2),
}))

function App() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [volume, setVolume] = useState(70)
  const [showControls, setShowControls] = useState(true)
  const playerRef = useRef(null)
  const hideTimerRef = useRef(null)

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      createPlayer()
      return
    }

    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScript = document.getElementsByTagName('script')[0]
    firstScript.parentNode.insertBefore(tag, firstScript)

    window.onYouTubeIframeAPIReady = () => {
      createPlayer()
    }

    return () => {
      window.onYouTubeIframeAPIReady = null
    }
  }, [])

  const createPlayer = useCallback(() => {
    if (playerRef.current) return

    playerRef.current = new window.YT.Player('yt-player', {
      videoId: YOUTUBE_VIDEO_ID,
      playerVars: {
        autoplay: 0,
        loop: 1,
        playlist: YOUTUBE_VIDEO_ID,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: (event) => {
          event.target.setVolume(70)
          setIsReady(true)
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.ENDED) {
            event.target.playVideo()
          }
        },
      },
    })
  }, [])

  const handlePlayPause = useCallback(() => {
    if (!playerRef.current || !isReady) return

    if (isPlaying) {
      playerRef.current.pauseVideo()
      setIsPlaying(false)
    } else {
      playerRef.current.playVideo()
      setIsPlaying(true)
    }
  }, [isPlaying, isReady])

  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseInt(e.target.value, 10)
    setVolume(newVolume)
    if (playerRef.current && isReady) {
      playerRef.current.setVolume(newVolume)
    }
  }, [isReady])

  // Auto-hide controls after inactivity
  useEffect(() => {
    const resetTimer = () => {
      setShowControls(true)
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        if (isPlaying) setShowControls(false)
      }, 3000)
    }

    window.addEventListener('mousemove', resetTimer)
    window.addEventListener('touchstart', resetTimer)

    return () => {
      window.removeEventListener('mousemove', resetTimer)
      window.removeEventListener('touchstart', resetTimer)
      clearTimeout(hideTimerRef.current)
    }
  }, [isPlaying])

  // Always show controls when paused
  useEffect(() => {
    if (!isPlaying) setShowControls(true)
  }, [isPlaying])

  // Keyboard shortcut: spacebar to toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        handlePlayPause()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlePlayPause])

  return (
    <div className="app">
      {/* Fullscreen Batman Image */}
      <div className="fullscreen-bg">
        <img
          src={batmanImg}
          alt="Batman studying at the Batcomputer"
          className="bg-image"
          id="batman-hero-image"
        />
        <div className="bg-darken" />
      </div>

      {/* Floating particles */}
      <div className="bg-particles">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="particle" />
        ))}
      </div>

      {/* Overlay Controls */}
      <div className={`controls-overlay ${showControls ? 'visible' : 'hidden'}`}>
        {/* Bottom Controls Bar */}
        <div className="bottom-bar">
          {/* Audio Visualizer */}
          <div className="visualizer" id="audio-visualizer">
            {BARS.map((bar) => (
              <div
                key={bar.id}
                className={`visualizer-bar ${isPlaying ? 'is-playing' : 'is-paused'}`}
                style={{
                  '--min-h': `${bar.minH}px`,
                  '--max-h': `${bar.maxH}px`,
                  '--duration': `${bar.duration}s`,
                  animationDuration: `${bar.duration}s`,
                  animationDelay: `${bar.delay}s`,
                  height: isPlaying ? undefined : '4px',
                }}
              />
            ))}
          </div>

          {/* Center Play/Pause */}
          <div className="center-controls">
            <button
              className={`play-btn ${isPlaying ? 'is-playing' : ''}`}
              onClick={handlePlayPause}
              id="play-pause-button"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              disabled={!isReady}
              title={!isReady ? 'Loading...' : isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <div className="btn-icon icon-pause">
                  <span />
                  <span />
                </div>
              ) : (
                <div className="btn-icon icon-play" />
              )}
            </button>

            <p className={`status-label ${isPlaying ? 'is-playing' : ''}`}>
              {!isReady ? 'Loading...' : isPlaying ? 'Now Playing' : 'Paused'}
            </p>
          </div>

          {/* Volume */}
          <div className="volume-control" id="volume-control">
            <svg
              className="volume-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {volume === 0 ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : volume < 50 ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
            <input
              type="range"
              className="volume-slider"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              id="volume-slider"
              aria-label="Volume"
              style={{ '--volume-pct': `${volume}%` }}
            />
            <span className="volume-value">{volume}%</span>
          </div>
        </div>
      </div>

      {/* Hidden YouTube Player */}
      <div className="youtube-container">
        <div id="yt-player" />
      </div>

      {/* Footer hint */}
      <div className={`footer ${showControls ? 'visible' : 'hidden'}`}>
        Press Space to play / pause
      </div>
    </div>
  )
}

export default App
