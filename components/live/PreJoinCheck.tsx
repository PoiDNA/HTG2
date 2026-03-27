'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Camera, CameraOff, CheckCircle, XCircle, Volume2 } from 'lucide-react';

interface PreJoinCheckProps {
  onReady: () => void;
}

export default function PreJoinCheck({ onReady }: PreJoinCheckProps) {
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [camOk, setCamOk] = useState<boolean | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  async function startTest() {
    setTesting(true);
    setErrorMsg('');

    // Try camera + mic together first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      setMicOk(true);
      setCamOk(true);

      // Show camera preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Audio level meter
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setMicLevel(avg / 128);
          animRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch {}

      return;
    } catch (err: any) {
      // Both failed — try individually
      console.log('Combined getUserMedia failed:', err.name, err.message);
    }

    // Try mic only
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicOk(true);
      if (streamRef.current) {
        audioStream.getAudioTracks().forEach(t => streamRef.current!.addTrack(t));
      } else {
        streamRef.current = audioStream;
      }

      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(audioStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setMicLevel(avg / 128);
          animRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch {}
    } catch (err: any) {
      setMicOk(false);
      setErrorMsg(prev => prev + `Mikrofon: ${err.name} — ${err.message}. `);
    }

    // Try camera only
    try {
      const vidStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCamOk(true);
      if (videoRef.current) {
        videoRef.current.srcObject = vidStream;
      }
      if (streamRef.current) {
        vidStream.getVideoTracks().forEach(t => streamRef.current!.addTrack(t));
      } else {
        streamRef.current = vidStream;
      }
    } catch (err: any) {
      setCamOk(false);
      setErrorMsg(prev => prev + `Kamera: ${err.name} — ${err.message}. `);
    }
  }

  const allTested = micOk !== null && camOk !== null;
  const allOk = micOk === true;

  return (
    <div className="relative z-20 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 p-8 max-w-md w-full mx-4">
      <h2 className="text-white font-serif font-bold text-xl mb-2 text-center">
        Test połączenia
      </h2>
      <p className="text-white/50 text-sm text-center mb-6">
        Sprawdź kamerę i mikrofon przed sesją
      </p>

      {!testing ? (
        <div className="space-y-3">
          <button
            onClick={startTest}
            className="w-full bg-htg-sage text-white py-3 rounded-xl font-medium hover:bg-htg-sage/90 transition-colors"
          >
            Sprawdź urządzenia
          </button>
          <button
            onClick={onReady}
            className="w-full text-white/40 text-xs hover:text-white/60 transition-colors py-2"
          >
            Pomiń test →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Camera preview */}
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {camOk === false && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
                <CameraOff className="w-8 h-8 text-yellow-400" />
                <span className="text-yellow-400/80 text-xs">Kamera niedostępna (opcjonalna)</span>
              </div>
            )}
            {camOk === null && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Status items */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {micOk === true ? <CheckCircle className="w-5 h-5 text-green-400" /> :
               micOk === false ? <XCircle className="w-5 h-5 text-red-400" /> :
               <Mic className="w-5 h-5 text-white/40" />}
              <span className="text-white text-sm flex-1">
                {micOk === true ? 'Mikrofon działa' : micOk === false ? 'Brak dostępu do mikrofonu' : 'Mikrofon...'}
              </span>
              {micOk && (
                <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full transition-all duration-75"
                    style={{ width: `${Math.min(100, micLevel * 100)}%` }} />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {camOk === true ? <CheckCircle className="w-5 h-5 text-green-400" /> :
               camOk === false ? <XCircle className="w-5 h-5 text-yellow-400" /> :
               <Camera className="w-5 h-5 text-white/40" />}
              <span className="text-white text-sm">
                {camOk === true ? 'Kamera działa' : camOk === false ? 'Kamera niedostępna (opcjonalna)' : 'Kamera...'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-white text-sm">Głośniki / słuchawki</span>
              <Volume2 className="w-4 h-4 text-white/30" />
            </div>
          </div>

          {errorMsg && (
            <div className="bg-yellow-900/20 rounded-lg p-3 space-y-2">
              <p className="text-yellow-400/70 text-xs">{errorMsg}</p>
              <p className="text-white/50 text-xs">
                💡 Kliknij ikonę 🔒 obok adresu strony → zezwól na kamerę i mikrofon → odśwież stronę.
              </p>
            </div>
          )}

          {allTested && (
            <button
              onClick={() => {
                cancelAnimationFrame(animRef.current);
                streamRef.current?.getTracks().forEach(t => t.stop());
                onReady();
              }}
              className={`w-full py-3 rounded-xl font-medium transition-colors mt-2 ${
                allOk
                  ? 'bg-htg-sage text-white hover:bg-htg-sage/90'
                  : 'bg-htg-warm/80 text-white hover:bg-htg-warm/70'
              }`}
            >
              {allOk ? 'Wszystko gotowe — wchodzę' : 'Kontynuuj mimo to'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
