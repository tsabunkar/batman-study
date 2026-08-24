import { useState, useEffect, useRef, useCallback } from "react";

const PHASES = {
  focus: { label: "Focus", seconds: 25 * 60 },
  shortBreak: { label: "Short Break", seconds: 5 * 60 },
  longBreak: { label: "Long Break", seconds: 15 * 60 },
};

const CYCLES_BEFORE_LONG_BREAK = 4;
const STATS_KEY = "batman_pomodoro_stats";
const TITLE_BASE = document.title;

const formatTime = (totalSeconds) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const loadCompletedToday = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY));
    return raw && raw.date === todayKey() ? raw.completed : 0;
  } catch (e) {
    return 0;
  }
};

export default function PomodoroTimer() {
  const [phase, setPhase] = useState("idle");
  const [remaining, setRemaining] = useState(PHASES.focus.seconds);
  const [isRunning, setIsRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [completedToday, setCompletedToday] = useState(loadCompletedToday);

  const endAtRef = useRef(null);
  const phaseRef = useRef(phase);
  const cyclesRef = useRef(cycles);
  const lastAdvanceRef = useRef(0);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const ensureAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
    } catch (e) {
      // no audio available; timer keeps working silently
    }
  }, []);

  const playChime = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [
      [880, 0],
      [1318.51, 0.18],
    ].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.6);
    });
  }, []);

  const advance = useCallback(
    (natural) => {
      const nowMs = Date.now();
      if (nowMs - lastAdvanceRef.current < 1000) return;
      lastAdvanceRef.current = nowMs;

      if (phaseRef.current === "focus") {
        let nextCycles = cyclesRef.current;
        if (natural) {
          nextCycles += 1;
          cyclesRef.current = nextCycles;
          setCycles(nextCycles);
          setCompletedToday((count) => {
            const updated = count + 1;
            try {
              localStorage.setItem(
                STATS_KEY,
                JSON.stringify({ date: todayKey(), completed: updated }),
              );
            } catch (e) {
              // storage unavailable
            }
            return updated;
          });
          playChime();
        }

        const next =
          nextCycles > 0 && nextCycles % CYCLES_BEFORE_LONG_BREAK === 0
            ? "longBreak"
            : "shortBreak";
        phaseRef.current = next;
        setPhase(next);
        setRemaining(PHASES[next].seconds);
        endAtRef.current = Date.now() + PHASES[next].seconds * 1000;
        return;
      }

      if (natural) playChime();
      phaseRef.current = "focus";
      setPhase("focus");
      setRemaining(PHASES.focus.seconds);
      endAtRef.current = Date.now() + PHASES.focus.seconds * 1000;
    },
    [playChime],
  );

  useEffect(() => {
    if (!isRunning) return undefined;

    const id = setInterval(() => {
      const left = Math.max(
        0,
        Math.round((endAtRef.current - Date.now()) / 1000),
      );
      setRemaining(left);
      if (left <= 0) advance(true);
    }, 250);

    return () => clearInterval(id);
  }, [isRunning, phase, advance]);

  useEffect(() => {
    if (phase === "idle") {
      document.title = TITLE_BASE;
      return;
    }
    document.title = `${formatTime(remaining)} — ${PHASES[phase].label}`;
  }, [phase, remaining]);

  useEffect(() => {
    return () => {
      document.title = TITLE_BASE;
    };
  }, []);

  const handleStartPause = useCallback(() => {
    ensureAudio();
    if (isRunning) {
      setRemaining(
        Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000)),
      );
      setIsRunning(false);
      return;
    }
    if (phaseRef.current === "idle") {
      phaseRef.current = "focus";
      setPhase("focus");
      setRemaining(PHASES.focus.seconds);
      endAtRef.current = Date.now() + PHASES.focus.seconds * 1000;
    } else {
      endAtRef.current = Date.now() + remaining * 1000;
    }
    setIsRunning(true);
  }, [isRunning, remaining, ensureAudio]);

  const handleSkip = useCallback(() => {
    advance(false);
  }, [advance]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    phaseRef.current = "idle";
    setPhase("idle");
    setRemaining(PHASES.focus.seconds);
    cyclesRef.current = 0;
    setCycles(0);
  }, []);

  const withBlur = (fn) => (event) => {
    event.currentTarget.blur();
    fn();
  };

  const phaseMeta = phase === "idle" ? null : PHASES[phase];
  const shownSeconds = phaseMeta ? remaining : PHASES.focus.seconds;
  const progress = phaseMeta ? 1 - remaining / phaseMeta.seconds : 0;
  const dotsFilled =
    phase === "longBreak" ? CYCLES_BEFORE_LONG_BREAK : cycles % CYCLES_BEFORE_LONG_BREAK;

  return (
    <div className="pomodoro">
      <button
        type="button"
        className="pomodoro-pill"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-label="Toggle Pomodoro timer"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 13.5" />
        </svg>
        <span className="pomodoro-phase">
          {phaseMeta ? phaseMeta.label : "Focus"}
        </span>
        <span className="pomodoro-time">{formatTime(shownSeconds)}</span>
      </button>

      {expanded && (
        <div className="pomodoro-panel" role="timer" aria-label="Pomodoro timer">
          <p className="pomodoro-status">
            {phaseMeta
              ? isRunning
                ? phaseMeta.label
                : `${phaseMeta.label} · Paused`
              : "Ready"}
          </p>
          <div className="pomodoro-clock">{formatTime(shownSeconds)}</div>
          <div className="pomodoro-track">
            <div
              className="pomodoro-fill"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
          <div
            className="pomodoro-dots"
            aria-label={`${dotsFilled} of ${CYCLES_BEFORE_LONG_BREAK} focus sessions`}
          >
            {Array.from({ length: CYCLES_BEFORE_LONG_BREAK }).map((_, i) => (
              <span
                key={i}
                className={`pomodoro-dot ${i < dotsFilled ? "filled" : ""}`}
              />
            ))}
          </div>
          <div className="pomodoro-controls">
            <button
              type="button"
              className="pomodoro-btn primary"
              onClick={withBlur(handleStartPause)}
            >
              {isRunning ? "Pause" : "Start"}
            </button>
            <button type="button" className="pomodoro-btn" onClick={withBlur(handleSkip)}>
              Skip
            </button>
            <button type="button" className="pomodoro-btn" onClick={withBlur(handleReset)}>
              Reset
            </button>
          </div>
          <p className="pomodoro-stats">{completedToday} focused today</p>
        </div>
      )}
    </div>
  );
}
