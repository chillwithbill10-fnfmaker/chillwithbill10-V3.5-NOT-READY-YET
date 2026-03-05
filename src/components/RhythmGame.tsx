import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Download, Trophy, Music, Settings, ArrowLeft, RotateCcw } from 'lucide-react';
import JSZip from 'jszip';

// --- Constants ---
const ARROW_SIZE = 60;
const COLUMN_WIDTH = 80;
const GAME_WIDTH = COLUMN_WIDTH * 4;
const GAME_HEIGHT = 600;
const HIT_ZONE_Y = 100; // Where the static arrows are
const NOTE_SPEED = 0.5; // Pixels per ms

type Direction = 'left' | 'down' | 'up' | 'right';
const DIRECTIONS: Direction[] = ['left', 'down', 'up', 'right'];

interface Note {
  id: string;
  direction: Direction;
  time: number; // Time in ms when it should be hit
  length: number; // Sustain length in ms
  hit: boolean;
  missed: boolean;
  held?: boolean;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  color: string;
  life: number;
}

interface Song {
  name: string;
  bpm: number;
  difficulty: string;
  audioUrl: string;
  color: string;
  description: string;
}

const SONGS: Song[] = [
  {
    name: 'Chill Beats',
    bpm: 120,
    difficulty: 'Easy',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    color: '#22c55e',
    description: 'A smooth introduction to the Chill Engine.'
  },
  {
    name: 'Glow Stick',
    bpm: 145,
    difficulty: 'Normal',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    color: '#3b82f6',
    description: 'Neon lights and fast rhythms.'
  },
  {
    name: 'Bill-ionaire',
    bpm: 160,
    difficulty: 'Hard',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    color: '#ef4444',
    description: 'Bill is not playing around anymore.'
  },
  {
    name: 'Final Boss',
    bpm: 185,
    difficulty: 'Insane',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    color: '#a855f7',
    description: 'The ultimate test of your rhythm skills.'
  }
];

// --- Mock Song Data ---
const generateNotes = (durationMs: number, bpm: number): Note[] => {
  const notes: Note[] = [];
  const beatInterval = (60 / bpm) * 1000;
  for (let t = 2000; t < durationMs; t += beatInterval / 2) { // 8th notes
    if (Math.random() > 0.4) {
      const isSustain = Math.random() > 0.85;
      notes.push({
        id: `note-${t}`,
        direction: DIRECTIONS[Math.floor(Math.random() * 4)],
        time: t,
        length: isSustain ? beatInterval : 0,
        hit: false,
        missed: false,
      });
    }
  }
  return notes;
};

export default function RhythmGame() {
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'results' | 'freeplay' | 'main-menu' | 'chart-editor' | 'character-editor'>('menu');
  const [isPaused, setIsPaused] = useState(false);
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [health, setHealth] = useState(50); // 0 to 100
  const [notes, setNotes] = useState<Note[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [lastHitRating, setLastHitRating] = useState<string | null>(null);
  const [lastMissTime, setLastMissTime] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [accuracy, setAccuracy] = useState(100);
  const [totalNotesHit, setTotalNotesHit] = useState(0);
  const [totalNotesPossible, setTotalNotesPossible] = useState(0);
  const [fps, setFps] = useState(0);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [engineSettings, setEngineSettings] = useState({
    downscroll: false,
    ghostTapping: true,
    flashing: true,
    cameraZooming: true
  });
  const [engineLogs, setEngineLogs] = useState<string[]>([]);
  
  const [strumState, setStrumState] = useState<Record<Direction, 'idle' | 'pressed' | 'confirm'>>({
    left: 'idle', down: 'idle', up: 'idle', right: 'idle'
  });
  const [particles, setParticles] = useState<Particle[]>([]);
  
  const beat = Math.floor(currentTime / 500);
  const lastBeatRef = useRef(-1);

  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(0);

  const addLog = (msg: string) => {
    setEngineLogs(prev => [msg, ...prev].slice(0, 5));
  };

  const audioRef = useRef<HTMLAudioElement>(null);

  const spawnSplash = (dir: Direction) => {
    const id = Math.random().toString(36).substring(7);
    const x = DIRECTIONS.indexOf(dir) * COLUMN_WIDTH + COLUMN_WIDTH / 2;
    const y = HIT_ZONE_Y;
    const color = getArrowColor(dir).replace('text-', '');
    
    setParticles(prev => [...prev, { id, x, y, color, life: 1.0 }]);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      
      // Psych Engine Mod Structure
      const modFolder = zip.folder("VS_Chillwithbill10");
      
      // pack.json
      modFolder?.file("pack.json", JSON.stringify({
        name: "VS Chillwithbill10",
        description: "A high-energy rhythm battle against the Chillwithbill10 Gang!",
        color: [34, 197, 94],
        restart: true
      }, null, 2));

      // Data (Charts) & Songs (Audio)
      const data = modFolder?.folder("data");
      const songs = modFolder?.folder("songs");

      SONGS.forEach(song => {
        const songKey = song.name.toLowerCase().replace(/\s+/g, '-');
        
        // Chart
        const songData = data?.folder(songKey);
        songData?.file("charts.json", JSON.stringify({
          song: song.name,
          notes: generateNotes(60000, song.bpm).map(n => [n.time, DIRECTIONS.indexOf(n.direction), 0]),
          bpm: song.bpm,
          needsVoices: true,
          player1: "bf",
          player2: "bill",
          stage: "stage"
        }, null, 2));

        // Audio
        const songAudio = songs?.folder(songKey);
        songAudio?.file("Inst.ogg", "MOCK_AUDIO_DATA");
        songAudio?.file("Voices.ogg", "MOCK_AUDIO_DATA");
      });

      // Images (Characters)
      const images = modFolder?.folder("images");
      const characters = images?.folder("characters");
      characters?.file("bill.png", "MOCK_IMAGE_DATA");
      characters?.file("bill.xml", `<?xml version="1.0" encoding="utf-8"?>
<TextureAtlas imagePath="bill.png">
	<SubTexture name="bill idle0000" x="0" y="0" width="150" height="150"/>
	<SubTexture name="bill left0000" x="150" y="0" width="150" height="150"/>
	<SubTexture name="bill down0000" x="300" y="0" width="150" height="150"/>
	<SubTexture name="bill up0000" x="450" y="0" width="150" height="150"/>
	<SubTexture name="bill right0000" x="600" y="0" width="150" height="150"/>
</TextureAtlas>`);

      // README
      zip.file("README_INSTALL.txt", `
VS CHILLWITHBILL10 GANG - PSYCH ENGINE MOD
==========================================

INSTALLATION:
1. Download and extract Psych Engine (v0.6.3 or newer).
2. Copy the 'VS_Chillwithbill10' folder into the 'mods' directory of Psych Engine.
3. Launch Psych Engine.
4. Go to 'Mods' in the main menu and ensure 'VS Chillwithbill10' is enabled.
5. Play 'Chill Beats' in Freeplay or Story Mode!

Mod by: Chillwithbill10
Engine: Psych Engine Compatible
      `);

      // Generate the zip
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'VS_CHILLWITHBILL10_PSYCH_MOD.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const [currentSong, setCurrentSong] = useState<Song>(SONGS[0]);

  const startGame = (song: Song = SONGS[0]) => {
    setCurrentSong(song);
    const newNotes = generateNotes(60000, song.bpm); // 1 minute song
    setNotes(newNotes);
    setScore(0);
    setCombo(0);
    setHealth(50);
    setAccuracy(100);
    setTotalNotesHit(0);
    setTotalNotesPossible(0);
    setGameState('playing');
    setStartTime(performance.now());
    setLastHitRating(null);
    setLastMissTime(0);
    setParticles([]);
    setIsPaused(false);
    
    if (audioRef.current) {
      audioRef.current.src = song.audioUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => console.log("Audio play failed - user interaction required"));
    }
  };

  const update = useCallback((time: number) => {
    if (isPaused) {
      lastTimeRef.current = time;
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    const elapsed = time - startTime;
    const deltaTime = time - (lastTimeRef.current || time);
    lastTimeRef.current = time;
    
    setFps(Math.round(1000 / deltaTime));
    setCurrentTime(elapsed);

    // Camera Zoom Decay
    if (engineSettings.cameraZooming) {
      setCameraZoom(z => Math.max(1, z - 0.01));
    }

    // Beat Trigger
    if (beat !== lastBeatRef.current) {
      lastBeatRef.current = beat;
      if (engineSettings.cameraZooming && beat % 4 === 0) {
        setCameraZoom(1.05);
        addLog(`Engine: Beat ${beat} - Camera Bump`);
      }
    }

    // Update particles
    setParticles(prev => prev.map(p => ({ ...p, life: p.life - 0.05 })).filter(p => p.life > 0));

    setNotes(prevNotes => {
      let healthPenalty = 0;
      const updated = prevNotes.map(note => {
        // Handle misses
        if (!note.hit && !note.missed && elapsed > note.time + 150) {
          healthPenalty += 5;
          setTotalNotesPossible(p => p + 1);
          setLastMissTime(elapsed);
          addLog(`Engine: Note Missed - ${note.direction}`);
          return { ...note, missed: true };
        }
        // Handle sustain holding
        if (note.hit && note.length > 0 && !note.missed) {
          const sustainEnd = note.time + note.length;
          if (elapsed < sustainEnd) {
            if (strumState[note.direction] === 'pressed' || strumState[note.direction] === 'confirm') {
              setHealth(h => Math.min(100, h + 0.5));
              setScore(s => s + 5);
            } else if (elapsed > note.time + 100) {
              // Dropped sustain
              addLog(`Engine: Sustain Dropped - ${note.direction}`);
              return { ...note, missed: true };
            }
          }
        }
        return note;
      });

      if (healthPenalty > 0) {
        setHealth(h => {
          const newHealth = Math.max(0, h - healthPenalty);
          if (newHealth <= 0) {
            setGameState('results');
          }
          return newHealth;
        });
        setCombo(0);
      }

      return updated;
    });

    if (elapsed > 62000) { // Song end
      setGameState('results');
      return;
    }

    requestRef.current = requestAnimationFrame(update);
  }, [startTime, strumState, beat, engineSettings.cameraZooming]);

  useEffect(() => {
    if (gameState === 'playing') {
      requestRef.current = requestAnimationFrame(update);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, update]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && gameState === 'playing') {
      setIsPaused(prev => {
        if (!prev) {
          if (audioRef.current) audioRef.current.pause();
        } else {
          if (audioRef.current) audioRef.current.play().catch(() => {});
        }
        return !prev;
      });
      return;
    }

    if (isPaused) return;

    if (gameState === 'playing' && e.key === '7') {
      setGameState('chart-editor');
      if (audioRef.current) audioRef.current.pause();
      return;
    }

    if (gameState === 'main-menu') {
      const menuItems = ['story-mode', 'freeplay', 'download-mod', 'options', 'credits'];
      if (e.key === 'ArrowUp') setSelectedMenuIndex(i => (i - 1 + menuItems.length) % menuItems.length);
      if (e.key === 'ArrowDown') setSelectedMenuIndex(i => (i + 1) % menuItems.length);
      if (e.key === 'Enter') {
        const selected = menuItems[selectedMenuIndex];
        if (selected === 'story-mode') startGame();
        if (selected === 'freeplay') setGameState('freeplay');
        if (selected === 'download-mod') handleDownload();
        if (selected === 'options') setGameState('character-editor'); // Using character-editor slot for options
      }
      return;
    }

    if (gameState !== 'playing') return;

    let dir: Direction | null = null;
    switch (e.key.toLowerCase()) {
      case 'arrowleft': case 'a': dir = 'left'; break;
      case 'arrowdown': case 's': dir = 'down'; break;
      case 'arrowup': case 'w': dir = 'up'; break;
      case 'arrowright': case 'd': dir = 'right'; break;
    }

    if (dir) {
      setStrumState(prev => ({ ...prev, [dir!]: 'pressed' }));
      
      if (isPaused) return;

      const now = currentTime;
      setNotes(prevNotes => {
        const noteIndex = prevNotes.findIndex(n => !n.hit && !n.missed && n.direction === dir && Math.abs(n.time - now) < 150);
        
        if (noteIndex !== -1) {
          const note = prevNotes[noteIndex];
          const diff = Math.abs(note.time - now);
          let rating = 'Good';
          let points = 100;
          let hpGain = 2;

          if (diff < 35) { 
            rating = 'Sick!!'; points = 350; hpGain = 5; 
            spawnSplash(dir!);
            setStrumState(prev => ({ ...prev, [dir!]: 'confirm' }));
          }
          else if (diff < 75) { rating = 'Great'; points = 200; hpGain = 3; }
          
          setScore(s => s + points);
          setCombo(c => c + 1);
          setHealth(h => Math.min(100, h + hpGain));
          setLastHitRating(rating);
          setTotalNotesHit(h => h + 1);
          setTotalNotesPossible(p => p + 1);

          const newNotes = [...prevNotes];
          newNotes[noteIndex] = { ...note, hit: true };
          return newNotes;
        } else {
          // Ghost tap penalty (optional, common in FNF engines)
          // setHealth(h => Math.max(0, h - 1));
          return prevNotes;
        }
      });
    }
  }, [gameState, currentTime]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (gameState !== 'playing') return;

    let dir: Direction | null = null;
    switch (e.key.toLowerCase()) {
      case 'arrowleft': case 'a': dir = 'left'; break;
      case 'arrowdown': case 's': dir = 'down'; break;
      case 'arrowup': case 'w': dir = 'up'; break;
      case 'arrowright': case 'd': dir = 'right'; break;
    }

    if (dir) {
      setStrumState(prev => ({ ...prev, [dir!]: 'idle' }));
    }
  }, [gameState]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  useEffect(() => {
    if (totalNotesPossible > 0) {
      setAccuracy(Math.round((totalNotesHit / totalNotesPossible) * 10000) / 100);
    }
  }, [totalNotesHit, totalNotesPossible]);

  const getArrowColor = (dir: Direction) => {
    switch (dir) {
      case 'left': return 'text-purple-500';
      case 'down': return 'text-blue-500';
      case 'up': return 'text-green-500';
      case 'right': return 'text-red-500';
    }
  };

  const getArrowRotation = (dir: Direction) => {
    switch (dir) {
      case 'left': return 'rotate-0';
      case 'down': return '-rotate-90';
      case 'up': return 'rotate-90';
      case 'right': return 'rotate-180';
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#9271fd] overflow-hidden font-sans text-white select-none">
      {/* Psych Engine Scrolling Background */}
      <div className="absolute inset-0 overflow-hidden opacity-20 pointer-events-none">
        <div 
          className="absolute inset-[-100%] bg-[url('https://picsum.photos/seed/checker/200/200')] bg-repeat animate-scroll"
          style={{ 
            backgroundSize: '100px 100px',
            backgroundImage: `linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000), 
                             linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000)`,
            backgroundPosition: '0 0, 50px 50px'
          }}
        />
      </div>

      <style>{`
        @keyframes scroll {
          from { transform: translate(0, 0); }
          to { transform: translate(100px, 100px); }
        }
        .animate-scroll {
          animation: scroll 2s linear infinite;
        }
      `}</style>
      
      {/* Main UI Overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        
        <AnimatePresence mode="wait">
          {gameState === 'menu' && (
            <motion.div 
              key="menu"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className="flex flex-col items-center gap-12"
            >
              <motion.img 
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                src="https://picsum.photos/seed/fnflogo/600/300" 
                className="w-[500px] drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]"
              />
              <div className="text-center space-y-4">
                <button 
                  onClick={() => setGameState('main-menu')}
                  className="text-4xl font-black italic tracking-tighter hover:text-yellow-400 transition-colors animate-pulse"
                >
                  PRESS ENTER TO START
                </button>
                <div className="text-sm font-mono opacity-50">PSYCH ENGINE WEB v0.6.3</div>
              </div>
            </motion.div>
          )}

          {gameState === 'main-menu' && (
            <motion.div 
              key="main-menu"
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-4 items-start w-full max-w-4xl px-20"
            >
              {['STORY MODE', 'FREEPLAY', 'DOWNLOAD MOD', 'OPTIONS', 'CREDITS'].map((item, i) => (
                <motion.div
                  key={item}
                  animate={{ 
                    x: selectedMenuIndex === i ? 50 : 0,
                    scale: selectedMenuIndex === i ? 1.2 : 1,
                    color: selectedMenuIndex === i ? '#ffff00' : '#ffffff'
                  }}
                  className="text-7xl font-black italic tracking-tighter cursor-pointer drop-shadow-lg"
                  onClick={() => {
                    if (i === 0) startGame();
                    if (i === 1) setGameState('freeplay');
                    if (i === 2) handleDownload();
                    if (i === 3) setGameState('character-editor');
                  }}
                >
                  {item}
                </motion.div>
              ))}
              <div className="absolute bottom-10 right-10 text-right">
                {isDownloading && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-yellow-400 font-bold mb-2 flex items-center justify-end gap-2"
                  >
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400" />
                    PACKAGING MOD...
                  </motion.div>
                )}
                <div className="text-2xl font-black italic text-green-400">VS CHILLWITHBILL10</div>
                <div className="text-sm opacity-50">MOD PACK LOADED</div>
              </div>
            </motion.div>
          )}

          {gameState === 'chart-editor' && (
            <motion.div 
              key="chart-editor"
              className="w-full h-full bg-[#111] flex flex-col p-4 font-mono"
            >
              <div className="flex justify-between items-center border-b border-white/20 pb-2">
                <div className="text-xl font-bold text-yellow-500">CHART EDITOR - Chill Beats</div>
                <button onClick={() => setGameState('playing')} className="bg-red-500 px-4 py-1 rounded">EXIT</button>
              </div>
              <div className="flex-1 flex gap-4 mt-4 overflow-hidden">
                <div className="w-64 bg-black/40 p-4 rounded overflow-y-auto">
                  <h3 className="text-sm font-bold mb-4 border-b border-white/10">SONG DATA</h3>
                  <div className="space-y-4 text-xs">
                    <div>BPM: <input type="number" defaultValue={120} className="bg-white/10 w-full p-1" /></div>
                    <div>SCROLL SPEED: <input type="number" defaultValue={2.4} className="bg-white/10 w-full p-1" /></div>
                    <div>PLAYER 1: <select className="bg-white/10 w-full p-1"><option>bf</option></select></div>
                    <div>PLAYER 2: <select className="bg-white/10 w-full p-1"><option>bill</option></select></div>
                  </div>
                </div>
                <div className="flex-1 bg-black/60 rounded relative overflow-hidden grid grid-cols-8 border-x border-white/20">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="border-r border-white/5 h-full relative">
                      {Array.from({ length: 16 }).map((_, j) => (
                        <div key={j} className="h-12 border-b border-white/5 w-full" />
                      ))}
                    </div>
                  ))}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10 text-4xl font-black">GRID SIMULATION</div>
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'freeplay' && (
            <motion.div 
              key="freeplay"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="flex flex-col items-center gap-6 p-8 bg-black/80 backdrop-blur-xl rounded-3xl border border-green-500/30 shadow-2xl w-full max-w-2xl"
            >
              <div className="flex items-center justify-between w-full border-b border-white/10 pb-4">
                <h2 className="text-4xl font-black italic uppercase text-green-400">Freeplay</h2>
                <button onClick={() => setGameState('menu')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <ArrowLeft size={32} />
                </button>
              </div>

              <div className="flex flex-col gap-3 w-full max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {SONGS.map((song, i) => (
                  <button 
                    key={song.name}
                    onClick={() => startGame(song)}
                    className="group flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/5 hover:bg-green-500/10 transition-all text-left"
                    style={{ borderColor: song.color + '33' }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center font-black text-black" style={{ backgroundColor: song.color }}>
                        {i + 1}
                      </div>
                      <div>
                        <div className="text-xl font-black">{song.name}</div>
                        <div className="text-xs text-white/40 uppercase tracking-widest">{song.difficulty} • {song.bpm} BPM</div>
                        <div className="text-[10px] text-white/20 mt-1">{song.description}</div>
                      </div>
                    </div>
                    <Play className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: song.color }} />
                  </button>
                ))}
              </div>

              <div className="text-[10px] text-white/20 uppercase tracking-widest">Select a track to begin the battle</div>
            </motion.div>
          )}

          {gameState === 'character-editor' && (
            <motion.div 
              key="options"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6 p-12 bg-black/80 backdrop-blur-xl rounded-3xl border border-green-500/30 shadow-2xl w-full max-w-2xl"
            >
              <h2 className="text-4xl font-black italic uppercase text-green-400 border-b border-white/10 w-full text-center pb-4">Engine Options</h2>
              
              <div className="flex flex-col gap-4 w-full">
                <button 
                  onClick={() => setEngineSettings(s => ({ ...s, downscroll: !s.downscroll }))}
                  className="flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all"
                >
                  <span className="text-xl font-bold uppercase tracking-widest">Downscroll</span>
                  <span className={`text-xl font-black ${engineSettings.downscroll ? 'text-green-400' : 'text-red-500'}`}>
                    {engineSettings.downscroll ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button 
                  onClick={() => setEngineSettings(s => ({ ...s, ghostTapping: !s.ghostTapping }))}
                  className="flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all"
                >
                  <span className="text-xl font-bold uppercase tracking-widest">Ghost Tapping</span>
                  <span className={`text-xl font-black ${engineSettings.ghostTapping ? 'text-green-400' : 'text-red-500'}`}>
                    {engineSettings.ghostTapping ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button 
                  onClick={() => setEngineSettings(s => ({ ...s, cameraZooming: !s.cameraZooming }))}
                  className="flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all"
                >
                  <span className="text-xl font-bold uppercase tracking-widest">Camera Zooming</span>
                  <span className={`text-xl font-black ${engineSettings.cameraZooming ? 'text-green-400' : 'text-red-500'}`}>
                    {engineSettings.cameraZooming ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              <button 
                onClick={() => setGameState('main-menu')}
                className="w-full py-4 bg-green-500 text-black font-black rounded-2xl hover:bg-green-400 transition-all mt-4"
              >
                SAVE & EXIT
              </button>
            </motion.div>
          )}

          {gameState === 'playing' && (
            <motion.div 
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, scale: cameraZoom }}
              className="w-full h-full flex flex-col items-center relative"
            >
              {/* Song Progress Bar */}
              <div className="absolute top-0 left-0 w-full h-1 bg-white/10 z-50">
                <motion.div 
                  className="h-full bg-green-500"
                  style={{ width: `${Math.min(100, (currentTime / 60000) * 100)}%` }}
                />
              </div>

              {/* Pause Menu Overlay */}
              <AnimatePresence>
                {isPaused && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center gap-8"
                  >
                    <h2 className="text-6xl font-black italic text-yellow-400 drop-shadow-lg">PAUSED</h2>
                    <div className="flex flex-col gap-4 w-64">
                      <button 
                        onClick={() => setIsPaused(false)}
                        className="py-4 bg-green-500 text-black font-black rounded-xl hover:scale-105 transition-transform"
                      >
                        RESUME
                      </button>
                      <button 
                        onClick={() => startGame(currentSong)}
                        className="py-4 bg-blue-500 text-white font-black rounded-xl hover:scale-105 transition-transform"
                      >
                        RESTART
                      </button>
                      <button 
                        onClick={() => {
                          setIsPaused(false);
                          setGameState('freeplay');
                          if (audioRef.current) {
                            audioRef.current.pause();
                            audioRef.current.currentTime = 0;
                          }
                        }}
                        className="py-4 bg-red-500 text-white font-black rounded-xl hover:scale-105 transition-transform"
                      >
                        EXIT TO FREEPLAY
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Engine Debug Info */}
              <div className="absolute top-4 right-4 text-right font-mono text-[10px] text-white/40 pointer-events-none z-50">
                <div>FPS: {fps}</div>
                <div>MEM: 24.5MB</div>
                <div>ZOOM: {cameraZoom.toFixed(2)}x</div>
                <div className="mt-2 border-t border-white/10 pt-1">
                  {engineLogs.map((log, i) => (
                    <div key={i} className="opacity-60">{log}</div>
                  ))}
                </div>
              </div>

              {/* Stage Background */}
              <div className="absolute inset-0 flex items-end justify-center pb-32 pointer-events-none">
                <div className="relative w-full max-w-6xl h-[400px] flex items-end justify-between px-10">
                  {/* Opponent: Bill */}
                  <motion.div 
                    animate={{ 
                      scaleY: beat % 2 === 0 ? [1, 1.05, 1] : 1,
                      y: beat % 2 === 0 ? [0, -10, 0] : 0
                    }}
                    transition={{ duration: 0.2 }}
                    className="relative flex flex-col items-center"
                  >
                    <div className="w-48 h-64 bg-green-500/20 rounded-t-full border-x-4 border-t-4 border-green-500/40 flex items-center justify-center overflow-hidden">
                      <img 
                        src="https://picsum.photos/seed/bill-sprite/200/300" 
                        alt="Bill" 
                        className="w-full h-full object-cover opacity-80"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="text-green-400 font-black italic text-xl mt-2 drop-shadow-lg">BILL</div>
                  </motion.div>

                  {/* GF on Speakers */}
                  <motion.div 
                    animate={{ 
                      scale: beat % 1 === 0 ? [1, 1.02, 1] : 1,
                    }}
                    transition={{ duration: 0.2 }}
                    className="absolute left-1/2 -translate-x-1/2 bottom-0 flex flex-col items-center"
                  >
                    <div className="w-64 h-40 bg-zinc-800 rounded-lg border-4 border-black shadow-2xl flex items-center justify-around px-4">
                      <div className="w-20 h-20 rounded-full bg-zinc-900 border-4 border-zinc-700" />
                      <div className="w-20 h-20 rounded-full bg-zinc-900 border-4 border-zinc-700" />
                    </div>
                    <div className="absolute -top-40 w-40 h-48 bg-red-500/20 rounded-t-full border-x-4 border-t-4 border-red-500/40 flex items-center justify-center overflow-hidden">
                      <img 
                        src="https://picsum.photos/seed/gf-sprite/200/300" 
                        alt="GF" 
                        className="w-full h-full object-cover opacity-80"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="text-red-400 font-black italic text-xl mt-2 drop-shadow-lg">GF</div>
                  </motion.div>

                  {/* Player: BF */}
                  <motion.div 
                    animate={{ 
                      scaleY: beat % 2 === 0 ? [1, 1.05, 1] : 1,
                      y: beat % 2 === 0 ? [0, -10, 0] : 0,
                      filter: currentTime - lastMissTime < 300 ? 'contrast(1.5) brightness(0.5) sepia(1) hue-rotate(-50deg)' : 'none'
                    }}
                    transition={{ duration: 0.2 }}
                    className="relative flex flex-col items-center"
                  >
                    <div className="w-48 h-64 bg-blue-500/20 rounded-t-full border-x-4 border-t-4 border-blue-500/40 flex items-center justify-center overflow-hidden">
                      <img 
                        src="https://picsum.photos/seed/bf-sprite/200/300" 
                        alt="BF" 
                        className="w-full h-full object-cover opacity-80"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="text-blue-400 font-black italic text-xl mt-2 drop-shadow-lg">BOYFRIEND</div>
                  </motion.div>
                </div>
              </div>

              {/* Health Bar */}
              <div className="absolute bottom-10 w-full max-w-md h-6 bg-gray-800 rounded-full overflow-hidden border-4 border-black shadow-lg flex">
                <div 
                  className="h-full bg-red-500 transition-all duration-100" 
                  style={{ width: `${100 - health}%` }} 
                />
                <div 
                  className="h-full bg-green-500 transition-all duration-100" 
                  style={{ width: `${health}%` }} 
                />
                {/* Icons */}
                <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
                  <div className="w-12 h-12 bg-green-500 rounded-full border-2 border-black -ml-4 flex items-center justify-center text-[10px] font-black shadow-[0_0_10px_rgba(34,197,94,0.5)]">BILL</div>
                  <div className="w-12 h-12 bg-blue-600 rounded-full border-2 border-black -mr-4 flex items-center justify-center text-[10px] font-black">BF</div>
                </div>
              </div>

              {/* Score & Combo */}
              <div className="absolute top-10 left-10 flex flex-col gap-1">
                <div className="text-sm font-mono text-white/50 uppercase tracking-widest">Song</div>
                <div className="text-2xl font-black italic mb-2" style={{ color: currentSong.color }}>{currentSong.name}</div>
                <div className="text-sm font-mono text-white/50 uppercase tracking-widest">Score</div>
                <div className="text-4xl font-black italic">{score.toLocaleString()}</div>
                <div className="text-sm font-mono text-green-400 uppercase tracking-widest">Accuracy: {accuracy}%</div>
                {combo > 0 && (
                  <motion.div 
                    key={combo}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-pink-500 font-black text-2xl italic"
                  >
                    {combo} COMBO
                  </motion.div>
                )}
              </div>

              {/* Rating Pop-up */}
              <AnimatePresence>
                {lastHitRating && (
                  <motion.div
                    key={lastHitRating + currentTime}
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 1.5 }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl font-black italic text-yellow-400 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] z-50"
                  >
                    {lastHitRating}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Game Field */}
              <div className={`relative ${engineSettings.downscroll ? 'flex flex-col-reverse' : 'flex flex-col'} mt-20`} style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
                {/* Particles / Splashes */}
                {particles.map(p => (
                  <div 
                    key={p.id}
                    className="absolute pointer-events-none z-40"
                    style={{ 
                      left: p.x - 40, 
                      top: engineSettings.downscroll ? GAME_HEIGHT - HIT_ZONE_Y - 40 : HIT_ZONE_Y - 40, 
                      width: 80, 
                      height: 80,
                      opacity: p.life,
                      transform: `scale(${1.5 - p.life})`,
                      background: `radial-gradient(circle, ${p.color} 0%, transparent 70%)`,
                      borderRadius: '50%',
                      filter: 'blur(4px)'
                    }}
                  />
                ))}

                {/* Hit Zone Arrows */}
                <div className="absolute w-full flex justify-between z-30" style={{ top: engineSettings.downscroll ? GAME_HEIGHT - HIT_ZONE_Y - 64 : HIT_ZONE_Y }}>
                  {DIRECTIONS.map(dir => {
                    const state = strumState[dir];
                    return (
                      <div 
                        key={`static-${dir}`} 
                        className={`w-16 h-16 flex items-center justify-center transition-all duration-75 ${getArrowColor(dir)} ${
                          state === 'pressed' ? 'scale-90 brightness-75' : 
                          state === 'confirm' ? 'scale-110 brightness-150 shadow-[0_0_20px_currentColor]' : 
                          'opacity-30'
                        }`}
                      >
                        <ArrowLeft className={`w-full h-full ${getArrowRotation(dir)}`} strokeWidth={4} />
                      </div>
                    );
                  })}
                </div>

                {/* Falling Notes */}
                <div className="relative w-full h-full">
                  {notes.filter(n => !n.hit && !n.missed && Math.abs(currentTime - n.time) < 1500).map(note => {
                    const distance = (note.time - currentTime) * NOTE_SPEED;
                    const y = engineSettings.downscroll ? (GAME_HEIGHT - HIT_ZONE_Y - 64) - distance : HIT_ZONE_Y + distance;
                    
                    if (y < -100 || y > GAME_HEIGHT + 100) return null;
                    
                    return (
                      <React.Fragment key={note.id}>
                        {/* Sustain Body */}
                        {note.length > 0 && (
                          <div 
                            className={`absolute w-4 opacity-50 ${getArrowColor(note.direction).replace('text-', 'bg-')}`}
                            style={{ 
                              left: DIRECTIONS.indexOf(note.direction) * COLUMN_WIDTH + 30,
                              top: engineSettings.downscroll ? y - (note.length * NOTE_SPEED) + 32 : y + 32,
                              height: note.length * NOTE_SPEED,
                              borderRadius: engineSettings.downscroll ? '4px 4px 0 0' : '0 0 4px 4px'
                            }}
                          />
                        )}
                        {/* Note Head */}
                        <div 
                          className={`absolute w-16 h-16 flex items-center justify-center ${getArrowColor(note.direction)}`}
                          style={{ 
                            left: DIRECTIONS.indexOf(note.direction) * COLUMN_WIDTH,
                            top: y
                          }}
                        >
                          <ArrowLeft className={`w-full h-full ${getArrowRotation(note.direction)}`} strokeWidth={4} />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Engine Info Bar */}
              <div className="absolute bottom-24 w-full text-center font-mono text-[10px] text-white/40 tracking-widest">
                CHILL ENGINE v1.0.0 • {currentSong.name.toUpperCase()} • SCORE: {score} • COMBO: {combo} • ACCURACY: {accuracy}% • HEALTH: {Math.round(health)}%
              </div>
            </motion.div>
          )}

          {gameState === 'results' && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6 p-12 bg-black/80 backdrop-blur-xl rounded-3xl border border-green-500/30 shadow-2xl"
            >
              {health <= 0 ? (
                <div className="text-red-500 flex flex-col items-center gap-2">
                  <RotateCcw className="w-20 h-20" />
                  <h2 className="text-4xl font-black italic uppercase">Game Over</h2>
                </div>
              ) : (
                <div className="text-yellow-400 flex flex-col items-center gap-2">
                  <Trophy className="w-20 h-20" />
                  <h2 className="text-4xl font-black italic uppercase">Performance</h2>
                </div>
              )}
              
              <div className="text-center">
                <div className="text-sm font-mono text-white/40 uppercase tracking-widest">{currentSong.name}</div>
                <div className="text-6xl font-black text-green-400 mt-2">{score.toLocaleString()}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="p-4 bg-white/5 rounded-xl text-center">
                  <div className="text-xs text-white/40 uppercase font-bold">Max Combo</div>
                  <div className="text-2xl font-bold">{combo}</div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl text-center">
                  <div className="text-xs text-white/40 uppercase font-bold">Status</div>
                  <div className={`text-2xl font-bold ${health <= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {health <= 0 ? 'FAILED' : 'CLEARED'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 w-full">
                <button 
                  onClick={startGame}
                  className="w-full py-4 bg-green-500 text-black font-black rounded-2xl hover:bg-green-400 transition-all"
                >
                  RETRY
                </button>
                <button 
                  onClick={() => setGameState('menu')}
                  className="w-full py-4 bg-white/10 text-white font-black rounded-2xl hover:bg-white/20 transition-all"
                >
                  BACK TO MENU
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} loop>
        <source src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" type="audio/mpeg" />
      </audio>

      {/* Footer Branding */}
      <div className="absolute bottom-4 right-4 text-[10px] font-mono opacity-30 uppercase tracking-tighter">
        Mod by Chillwithbill10 Gang • Build 0.4.2-alpha
      </div>
    </div>
  );
}
