'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Camera, CameraOff, CheckCircle, XCircle, Volume2 } from 'lucide-react';

interface PreJoinCheckProps {
  onReady: () => void;
}

export default function PreJoinCheck({ onReady }: PreJoinCheckProps) {
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [camOk, setCamOk] = useState<boolean | null>(null);
  const [speakerOk, setSpeakerOk] = useState<boolean | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(0);

  async function startTest() {
    setTesting(true);

    // Test microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicOk(true);
      streamRef.current = stream;

      // Audio level meter
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicLevel(avg / 128);
        animRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch {
      setMicOk(false);
    }

    // Test camera
    try {
      const vidStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCamOk(true);
      if (videoRef.current) {
        videoRef.current.srcObject = vidStream;
      }
      // Merge with existing stream
      if (streamRef.current) {
        vidStream.getVideoTracks().forEach(t => streamRef.current!.addTrack(t));
      } else {
        streamRef.current = vidStream;
      }
    } catch {
      setCamOk(false);
    }

    // Speaker test — just mark as OK (user confirms by hearing music in waiting room)
    setSpeakerOk(true);
  }

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const allOk = micOk === true && camOk !== null;
  const allTested = micOk !== null && camOk !== null;

  return (
    <div className="relative z-20 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 p-8 max-w-md w-full mx-4">
      <h2 className="text-white font-serif font-bold text-xl mb-2 text-center">
        Test połączenia
      </h2>
      <p className="text-white/50 text-sm text-center mb-6">
        Sprawdź kamerę i mikrofon przed sesją
      </p>

      {!testing ? (
        <button
          onClick={startTest}
          className="w-full bg-htg-sage text-white py-3 rounded-xl font-medium hover:bg-htg-sage/90 transition-colors"
        >
          Sprawdź urządzenia
        </button>
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
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <CameraOff className="w-8 h-8 text-red-400" />
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
            {/* Microphone */}
            <div className="flex items-center gap-3">
              {micOk === true ? <CheckCircle className="w-5 h-5 text-green-400" /> :
               micOk === false ? <XCircle className="w-5 h-5 text-red-400" /> :
               <Mic className="w-5 h-5 text-white/40" />}
              <span className="text-white text-sm flex-1">
                {micOk === true ? 'Mikrofon działa' : micOk === false ? 'Brak dostępu do mikrofonu' : 'Mikrofon...'}
              </span>
              {micOk && (
                <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-400 rounded-full transition-all duration-75"
                    style={{ width: `${Math.min(100, micLevel * 100)}%` }}
                  />
                </div>
              )}
            </div>

            {/* Camera */}
            <div className="flex items-center gap-3">
              {camOk === true ? <CheckCircle className="w-5 h-5 text-green-400" /> :
               camOk === false ? <XCircle className="w-5 h-5 text-yellow-400" /> :
               <Camera className="w-5 h-5 text-white/40" />}
              <span className="text-white text-sm">
                {camOk === true ? 'Kamera działa' : camOk === false ? 'Kamera niedostępna (opcjonalna)' : 'Kamera...'}
              </span>
            </div>

            {/* Speaker */}
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-white text-sm">Głośniki / słuchawki</span>
              <Volume2 className="w-4 h-4 text-white/30" />
            </div>
          </div>

          {/* Continue button */}
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
