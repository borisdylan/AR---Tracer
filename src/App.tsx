import React, { useRef, useEffect, useState } from 'react';
import { Camera, Image as ImageIcon, Lock, Unlock, RotateCcw, Maximize, Minimize, Settings2, Grid, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import { useGesture } from '@use-gesture/react';
import { animated, useSpring } from '@react-spring/web';

// --- Components ---

const CameraView = ({ isLocked, onCapture, lockBrightness }: { isLocked: boolean; onCapture: (url: string) => void; lockBrightness: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const videoTrack = stream.getVideoTracks()[0];
          setTrack(videoTrack);
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    startCamera();

    const handleCapture = () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL('image/png');
          onCapture(url);
        }
      }
    };

    window.addEventListener('capture-photo', handleCapture);
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      window.removeEventListener('capture-photo', handleCapture);
    };
  }, [onCapture]);

  useEffect(() => {
    if (track && 'applyConstraints' in track) {
      const capabilities = track.getCapabilities() as any;
      if (capabilities.exposureMode) {
        track.applyConstraints({
          advanced: [{ exposureMode: lockBrightness ? 'manual' : 'continuous' }]
        } as any).catch(console.error);
      }
    }
  }, [track, lockBrightness]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const OverlayImage = ({ 
  imageUrl, 
  opacity, 
  isLocked, 
  isContourMode,
  isGrayscale,
  onReset 
}: { 
  imageUrl: string | null; 
  opacity: number; 
  isLocked: boolean;
  isContourMode: boolean;
  isGrayscale: boolean;
  onReset: () => void;
}) => {
  const [{ x, y, scale, rotate }, api] = useSpring(() => ({
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
  }));

  const bind = useGesture(
    {
      onDrag: ({ offset: [ox, oy] }) => {
        if (!isLocked) api.start({ x: ox, y: oy });
      },
      onPinch: ({ offset: [d, a] }) => {
        if (!isLocked) api.start({ scale: d, rotate: a });
      },
    },
    {
      drag: { from: () => [x.get(), y.get()] },
      pinch: { from: () => [scale.get(), rotate.get()] },
    }
  );

  useEffect(() => {
    // Listen for reset
    const handleReset = () => {
      api.start({ x: 0, y: 0, scale: 1, rotate: 0 });
    };
    window.addEventListener('reset-overlay', handleReset);
    return () => window.removeEventListener('reset-overlay', handleReset);
  }, [api]);

  if (!imageUrl) return null;

  const filterStyle = [
    isGrayscale ? 'grayscale(100%)' : '',
    isContourMode ? 'url(#edge-detection) contrast(200%) brightness(150%) invert(1) grayscale(100%)' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
      <animated.div
        {...(bind() as any)}
        style={{
          x,
          y,
          scale,
          rotate,
          opacity: opacity / 100,
          touchAction: 'none',
          pointerEvents: isLocked ? 'none' : 'auto',
        }}
        className="relative max-w-[90%] max-h-[90%]"
      >
        <img
          src={imageUrl}
          alt="Overlay"
          className="w-full h-full object-contain select-none"
          style={{ filter: filterStyle }}
          draggable={false}
        />
      </animated.div>
    </div>
  );
};

export default function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(50);
  const [isLocked, setIsLocked] = useState(false);
  const [isMinimalUI, setIsMinimalUI] = useState(false);
  const [isContourMode, setIsContourMode] = useState(false);
  const [isGrayscale, setIsGrayscale] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [lockBrightness, setLockBrightness] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallTip, setShowInstallTip] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if running as PWA
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(!!isPWA);
    
    // Show install tip if not standalone and on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isPWA && isMobile) {
      setShowInstallTip(true);
    }
    
    // Prevent scrolling on mobile
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageUrl(url);
    }
  };

  const handleReset = () => {
    window.dispatchEvent(new CustomEvent('reset-overlay'));
  };

  return (
    <div className="relative w-full h-screen bg-black text-white font-sans overflow-hidden">
      {/* SVG Filters */}
      <svg className="hidden">
        <filter id="edge-detection">
          <feConvolveMatrix
            order="3"
            kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1"
            preserveAlpha="true"
          />
        </filter>
      </svg>

      {/* Camera Layer */}
      <CameraView isLocked={isLocked} onCapture={(url) => setImageUrl(url)} lockBrightness={lockBrightness} />

      {/* Grid Layer */}
      {showGrid && (
        <div className="fixed inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/20">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="border border-white/10" />
          ))}
        </div>
      )}

      {/* Overlay Image Layer */}
      <OverlayImage 
        imageUrl={imageUrl} 
        opacity={opacity} 
        isLocked={isLocked} 
        isContourMode={isContourMode}
        isGrayscale={isGrayscale}
        onReset={handleReset}
      />

      {/* UI Layer */}
      {!isMinimalUI && (
        <div className="absolute inset-0 flex flex-col justify-between p-4 pt-[env(safe-area-inset-top,1rem)] pb-[env(safe-area-inset-bottom,1rem)] pointer-events-none">
          {/* Top Bar */}
          <div className="flex justify-between items-center pointer-events-auto">
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-black/50 backdrop-blur-md rounded-full hover:bg-black/70 transition-colors"
                title="Importer une image"
              >
                <ImageIcon size={24} />
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('capture-photo'))}
                className="p-3 bg-black/50 backdrop-blur-md rounded-full hover:bg-black/70 transition-colors"
                title="Prendre une photo"
              >
                <Camera size={24} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              {imageUrl && (
                <button
                  onClick={handleReset}
                  className="p-3 bg-black/50 backdrop-blur-md rounded-full hover:bg-black/70 transition-colors"
                  title="Réinitialiser la position"
                >
                  <RotateCcw size={24} />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {!isStandalone && (
                <button
                  onClick={toggleFullscreen}
                  className="p-3 bg-black/50 backdrop-blur-md rounded-full hover:bg-black/70 transition-colors"
                  title="Plein écran"
                >
                  <Maximize size={24} />
                </button>
              )}
              <button
                onClick={() => setIsMinimalUI(true)}
                className="p-3 bg-black/50 backdrop-blur-md rounded-full hover:bg-black/70 transition-colors"
                title="Masquer les contrôles"
              >
                <EyeOff size={24} />
              </button>
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="flex flex-col gap-4 pointer-events-auto">
            {imageUrl && (
              <div className="bg-black/50 backdrop-blur-md p-4 rounded-2xl flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <EyeOff size={18} className="text-white/50" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={opacity}
                    onChange={(e) => setOpacity(parseInt(e.target.value))}
                    className="flex-1 accent-white"
                  />
                  <Eye size={18} className="text-white/50" />
                </div>
                
                <div className="flex justify-around items-center pt-2 border-t border-white/10 overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setIsLocked(!isLocked)}
                    className={`flex flex-col items-center gap-1 min-w-[64px] ${isLocked ? 'text-yellow-400' : 'text-white/70'}`}
                  >
                    {isLocked ? <Lock size={20} /> : <Unlock size={20} />}
                    <span className="text-[10px] uppercase font-bold">Verrouiller</span>
                  </button>

                  <button
                    onClick={() => setLockBrightness(!lockBrightness)}
                    className={`flex flex-col items-center gap-1 min-w-[64px] ${lockBrightness ? 'text-orange-400' : 'text-white/70'}`}
                  >
                    <Sun size={20} />
                    <span className="text-[10px] uppercase font-bold">Lumière</span>
                  </button>

                  <button
                    onClick={() => setIsContourMode(!isContourMode)}
                    className={`flex flex-col items-center gap-1 min-w-[64px] ${isContourMode ? 'text-blue-400' : 'text-white/70'}`}
                  >
                    <Settings2 size={20} />
                    <span className="text-[10px] uppercase font-bold">Contour</span>
                  </button>

                  <button
                    onClick={() => setIsGrayscale(!isGrayscale)}
                    className={`flex flex-col items-center gap-1 min-w-[64px] ${isGrayscale ? 'text-purple-400' : 'text-white/70'}`}
                  >
                    <Moon size={20} />
                    <span className="text-[10px] uppercase font-bold">N&B</span>
                  </button>

                  <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`flex flex-col items-center gap-1 min-w-[64px] ${showGrid ? 'text-green-400' : 'text-white/70'}`}
                  >
                    <Grid size={20} />
                    <span className="text-[10px] uppercase font-bold">Grille</span>
                  </button>
                </div>
              </div>
            )}
            
            {!imageUrl && (
              <div className="bg-black/50 backdrop-blur-md p-8 rounded-2xl text-center">
                <p className="text-white/70 mb-4">Importez une image pour commencer le décalquage</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-colors"
                >
                  Choisir une image
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Minimal UI Restore Button */}
      {isMinimalUI && (
        <button
          onClick={() => setIsMinimalUI(false)}
          className="absolute top-[env(safe-area-inset-top,1rem)] right-4 p-3 bg-black/50 backdrop-blur-md rounded-full hover:bg-black/70 transition-colors pointer-events-auto"
        >
          <Maximize size={24} />
        </button>
      )}

      {/* PWA Install Tip */}
      {showInstallTip && (
        <div className="fixed bottom-24 left-4 right-4 bg-white text-black p-4 rounded-2xl shadow-2xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-auto">
          <div className="flex-1">
            <p className="font-bold text-sm">Installer TraceAR</p>
            <p className="text-xs text-gray-600">Ajoutez l'app à votre écran d'accueil pour une expérience plein écran.</p>
          </div>
          <button 
            onClick={() => setShowInstallTip(false)}
            className="ml-4 p-2 bg-gray-100 rounded-full"
          >
            <Maximize size={16} className="rotate-45" />
          </button>
        </div>
      )}
    </div>
  );
}
