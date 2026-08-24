import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import batmanCalmImg from "../batman_study.png";
import batmanAggressiveImg from "../batman_agressive.png";
import PomodoroTimer from "./components/PomodoroTimer";

const ANALYTICS_API_ENDPOINT =
  import.meta.env.VITE_ANALYTICS_API ||
  "https://your-api-gateway-url.execute-api.region.amazonaws.com/prod";

const MODE_KEY = "batman_mode";

const MODES = {
  calm: {
    id: "calm",
    label: "Calm Flow",
    image: batmanCalmImg,
    videoId: "ZkfZvz_2bPE",
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive",
    image: batmanAggressiveImg,
    videoId: "YNc7hA5Macg",
  },
};

// Visualizer bar config
const BARS = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  minH: Math.random() * 4 + 2,
  maxH: Math.random() * 24 + 8,
  duration: (Math.random() * 0.6 + 0.3).toFixed(2),
  delay: (Math.random() * 0.5).toFixed(2),
}));

// Record a track's current playback second so it can be resumed later
const capturePosition = (player, videoId, store) => {
  try {
    const t = player?.getCurrentTime();
    if (typeof t === "number" && Number.isFinite(t)) {
      store[videoId] = t;
    }
  } catch (e) {
    // player mid-load; skip this sample
  }
};

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [volume, setVolume] = useState(70);
  const [showControls, setShowControls] = useState(true);
  const [mode, setMode] = useState(() => {
    try {
      const stored = localStorage.getItem(MODE_KEY);
      return stored && MODES[stored] ? stored : "calm";
    } catch (e) {
      return "calm";
    }
  });
  const playerRef = useRef(null);
  const loadedVideoRef = useRef(MODES[mode].videoId);
  const positionsRef = useRef({});
  const hideTimerRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch (e) {
      // ignore
    }
  }, [mode]);

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      createPlayer();
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode.insertBefore(tag, firstScript);

    window.onYouTubeIframeAPIReady = () => {
      createPlayer();
    };

    return () => {
      window.onYouTubeIframeAPIReady = null;
    };
  }, []);

  const createPlayer = useCallback(() => {
    if (playerRef.current) return;

    const { videoId } = MODES[mode];

    playerRef.current = new window.YT.Player("yt-player", {
      videoId,
      playerVars: {
        autoplay: 0,
        loop: 1,
        playlist: videoId,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: (event) => {
          event.target.setVolume(70);
          setIsReady(true);
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.ENDED) {
            event.target.playVideo();
          }
        },
      },
    });
  }, [mode]);

  // Swap background track when mode changes, resuming each song where it
  // left off. playing -> loadVideoById keeps playback seamless; paused -> cue only
  useEffect(() => {
    const nextVideoId = MODES[mode].videoId;
    if (!playerRef.current || !isReady) return;
    if (loadedVideoRef.current === nextVideoId) return;

    capturePosition(
      playerRef.current,
      loadedVideoRef.current,
      positionsRef.current,
    );

    const startSeconds = positionsRef.current[nextVideoId] || 0;
    loadedVideoRef.current = nextVideoId;

    const loadOpts = { videoId: nextVideoId, startSeconds };
    if (isPlaying) {
      playerRef.current.loadVideoById(loadOpts);
    } else {
      playerRef.current.cueVideoById(loadOpts);
    }
  }, [mode, isReady, isPlaying]);

  // Sample the active track's position every 3s so resumes stay accurate
  // even after a natural loop restart
  useEffect(() => {
    if (!isPlaying || !isReady) return;

    const sampler = setInterval(() => {
      capturePosition(
        playerRef.current,
        loadedVideoRef.current,
        positionsRef.current,
      );
    }, 3000);

    return () => clearInterval(sampler);
  }, [isPlaying, isReady]);

  const handleModeChange = useCallback((nextMode) => {
    setMode(nextMode);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!playerRef.current || !isReady) return;

    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      // Track play button click
      fetch(`${ANALYTICS_API_ENDPOINT}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch((err) => console.error("Analytics tracking failed:", err));

      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  }, [isPlaying, isReady]);

  const handleVolumeChange = useCallback(
    (e) => {
      const newVolume = parseInt(e.target.value, 10);
      setVolume(newVolume);
      if (playerRef.current && isReady) {
        playerRef.current.setVolume(newVolume);
      }
    },
    [isReady],
  );

  // Auto-hide controls after inactivity
  useEffect(() => {
    const resetTimer = () => {
      setShowControls(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (isPlaying) setShowControls(false);
      }, 3000);
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("touchstart", resetTimer);

    return () => {
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
      clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying]);

  // Always show controls when paused
  useEffect(() => {
    if (!isPlaying) setShowControls(true);
  }, [isPlaying]);

  // Keyboard shortcut: spacebar to toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayPause]);

  const STICKY_TEXT_KEY = "batman_protocol_text";
  const STICKY_POS_KEY = "batman_protocol_pos";
  const defaultStickyText = `Train strength
Learn to be bored (discipline)
Skill stacking
Control your inner joker
Silence`;
  const defaultStickyPosition = { x: 20, y: 20 };

  const [stickyText, setStickyText] = useState(() => {
    try {
      return localStorage.getItem(STICKY_TEXT_KEY) || defaultStickyText;
    } catch (e) {
      return defaultStickyText;
    }
  });
  const [stickyPosition, setStickyPosition] = useState(() => {
    try {
      const raw = localStorage.getItem(STICKY_POS_KEY);
      return raw ? JSON.parse(raw) : defaultStickyPosition;
    } catch (e) {
      return defaultStickyPosition;
    }
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });
  const textareaRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STICKY_TEXT_KEY, stickyText);
    } catch (e) {
      // ignore
    }
  }, [stickyText]);

  useEffect(() => {
    try {
      localStorage.setItem(STICKY_POS_KEY, JSON.stringify(stickyPosition));
    } catch (e) {
      // ignore
    }
  }, [stickyPosition]);

  const handleDragStart = useCallback(
    (event) => {
      if (isEditing) return;
      const target = event.target;
      if (target.closest && target.closest(".sticky-textarea")) return;

      const pageX =
        event.type === "touchstart" ? event.touches[0].pageX : event.pageX;
      const pageY =
        event.type === "touchstart" ? event.touches[0].pageY : event.pageY;

      dragRef.current = {
        active: true,
        startX: pageX,
        startY: pageY,
        origX: stickyPosition.x,
        origY: stickyPosition.y,
      };
      setIsDragging(true);
    },
    [stickyPosition, isEditing],
  );

  const handleDragMove = useCallback((event) => {
    if (!dragRef.current.active) return;
    const pageX =
      event.type === "touchmove" ? event.touches[0].pageX : event.pageX;
    const pageY =
      event.type === "touchmove" ? event.touches[0].pageY : event.pageY;
    const deltaX = pageX - dragRef.current.startX;
    const deltaY = pageY - dragRef.current.startY;
    setStickyPosition((pos) => ({
      x: Math.max(
        8,
        Math.min(window.innerWidth - 170, dragRef.current.origX + deltaX),
      ),
      y: Math.max(
        8,
        Math.min(window.innerHeight - 220, dragRef.current.origY + deltaY),
      ),
    }));
  }, []);

  const stopDrag = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (dragRef.current.active) {
        handleDragMove(e);
      }
    };
    const onRelease = () => stopDrag();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onRelease);
    window.addEventListener("touchend", onRelease);
    window.addEventListener("touchcancel", onRelease);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onRelease);
      window.removeEventListener("touchend", onRelease);
      window.removeEventListener("touchcancel", onRelease);
    };
  }, [handleDragMove, stopDrag]);

  const handleClick = () => {
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  return (
    <div className="app" data-mode={mode}>
      {/* Fullscreen Batman Image (both stacked for smooth crossfade) */}
      <div className="fullscreen-bg">
        {Object.values(MODES).map((m) => (
          <img
            key={m.id}
            src={m.image}
            alt={`Batman — ${m.label} mode`}
            className={`bg-image ${mode === m.id ? "active" : ""}`}
          />
        ))}
        <div className="bg-darken" />
      </div>

      {/* Floating particles */}
      <div className="bg-particles">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="particle" />
        ))}
      </div>

      {/* Sticky Note — BATMAN PROTOCOL (editable) */}
      <aside
        className={`sticky-note ${isDragging ? "dragging" : ""}`}
        role="note"
        aria-label="Batman Protocol"
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        onClick={handleClick}
        style={{
          left: `${stickyPosition.x}px`,
          top: `${stickyPosition.y}px`,
        }}
      >
        <h4>BATMAN PROTOCOL</h4>
        <div className="sticky-editor">
          <textarea
            ref={textareaRef}
            className="sticky-textarea"
            value={stickyText}
            onChange={(e) => setStickyText(e.target.value)}
            onBlur={handleBlur}
            rows={8}
            spellCheck="false"
            readOnly={!isEditing}
            aria-label="Batman Protocol notes"
          />
        </div>
      </aside>

      {/* Pomodoro Timer (Top-right) */}
      <PomodoroTimer />

      {/* Overlay Controls */}
      <div
        className={`controls-overlay ${showControls ? "visible" : "hidden"}`}
      >
        <div className="bottom-bar">
          <div className="visualizer" id="audio-visualizer">
            {BARS.map((bar) => (
              <div
                key={bar.id}
                className={`visualizer-bar ${isPlaying ? "is-playing" : "is-paused"}`}
                style={{
                  "--min-h": `${bar.minH}px`,
                  "--max-h": `${bar.maxH}px`,
                  "--duration": `${bar.duration}s`,
                  animationDuration: `${bar.duration}s`,
                  animationDelay: `${bar.delay}s`,
                  height: isPlaying ? undefined : "4px",
                }}
              />
            ))}
          </div>

          {/* Mode Toggle */}
          <div className="mode-toggle" role="group" aria-label="Batman mode">
            {Object.values(MODES).map((m) => (
              <button
                key={m.id}
                className={`mode-btn ${mode === m.id ? "active" : ""}`}
                onClick={() => handleModeChange(m.id)}
                aria-pressed={mode === m.id}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Center Play/Pause */}
          <div className="center-controls">
            <button
              className={`play-btn ${isPlaying ? "is-playing" : ""}`}
              onClick={handlePlayPause}
              id="play-pause-button"
              aria-label={isPlaying ? "Pause" : "Play"}
              disabled={!isReady}
              title={!isReady ? "Loading..." : isPlaying ? "Pause" : "Play"}
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

            <p className={`status-label ${isPlaying ? "is-playing" : ""}`}>
              {!isReady ? "Loading..." : isPlaying ? "Now Playing" : "Paused"}
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
              style={{ "--volume-pct": `${volume}%` }}
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
      <div className={`footer ${showControls ? "visible" : "hidden"}`}>
        Press Space to play / pause
      </div>
    </div>
  );
}

export default App;
