'use client';

import { useReducer, useRef, useCallback, useEffect, useState } from 'react';
import { DawToolbar } from './DawToolbar';
import { DawTimeline } from './DawTimeline';
import { DawTrack } from './DawTrack';
import { DawPlayhead } from './DawPlayhead';
import { DawSelection } from './DawSelection';
import { DawMasterControls } from './DawMasterControls';
import {
  dawReducer,
  initialDawState,
  computePeaks,
  renderRegionsToBuffer,
  getTrackColor,
} from '@/lib/daw/editor-state';
import type { DawTrack as DawTrackType, AudioRegion } from '@/lib/daw/editor-state';
import { encodeWav, mixBuffers } from '@/lib/daw/wav-encoder';
import type { TrackInfo } from '@/lib/publication/types';
import { Loader2 } from 'lucide-react';

interface DawEditorProps {
  publicationId: string;
  tracks: TrackInfo[];
  labels: {
    loading: string;
    loading_track: string;
    play: string;
    pause: string;
    stop: string;
    rewind: string;
    zoom_in: string;
    zoom_out: string;
    select: string;
    cut: string;
    delete: string;
    trim: string;
    fade_in: string;
    fade_out: string;
    undo: string;
    redo: string;
    save: string;
    export_mix: string;
    export_tracks: string;
    saving: string;
    solo: string;
    mute: string;
    master_volume: string;
    save_success: string;
    save_error: string;
    export_progress: string;
  };
}

const TRACK_HEIGHT = 120;
const TRACK_PANEL_WIDTH = 180;
const PEAKS_RESOLUTION = 4000; // peak samples for waveform rendering

export function DawEditor({ publicationId, tracks: trackInfos, labels }: DawEditorProps) {
  const [state, dispatch] = useReducer(dawReducer, initialDawState);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const masterGainRef = useRef<GainNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const peakLevelsRef = useRef<Map<string, number>>(new Map());
  const [peakLevels, setPeakLevels] = useState<Map<string, number>>(new Map());

  // Track mouse state for selection
  const isDraggingRef = useRef(false);
  const dragStartTimeRef = useRef(0);

  // Initialize AudioContext lazily
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      masterGainRef.current = audioCtxRef.current.createGain();
      masterGainRef.current.connect(audioCtxRef.current.destination);
    }
    return audioCtxRef.current;
  }, []);

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load tracks
  useEffect(() => {
    let cancelled = false;

    async function loadTracks() {
      dispatch({ type: 'SET_LOADING', loading: true });
      const ctx = getAudioCtx();
      const loaded: DawTrackType[] = [];

      for (let i = 0; i < trackInfos.length; i++) {
        const info = trackInfos[i];
        setLoadingProgress(`${labels.loading_track} ${info.name} (${i + 1}/${trackInfos.length})`);

        try {
          const downloadUrl = `/api/publikacja/download/${publicationId}/source/${encodeURIComponent(info.name)}`;
          const resp = await fetch(downloadUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

          const arrayBuffer = await resp.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

          if (cancelled) return;

          const peaks = computePeaks(audioBuffer, PEAKS_RESOLUTION);
          const trackName = info.name.replace(/\.wav$/i, '').replace(/_/g, ' ');

          loaded.push({
            id: `track-${i}`,
            name: trackName,
            color: getTrackColor(trackName),
            audioBuffer,
            regions: [
              {
                start: 0,
                end: audioBuffer.length,
                fadeIn: 0,
                fadeOut: 0,
              },
            ],
            peaks,
            volume: 1,
            mute: false,
            solo: false,
          });
        } catch (err) {
          console.error(`Failed to load track ${info.name}:`, err);
          // Add a placeholder track
          loaded.push({
            id: `track-${i}`,
            name: info.name.replace(/\.wav$/i, ''),
            color: getTrackColor(info.name),
            audioBuffer: null,
            regions: [],
            peaks: null,
            volume: 1,
            mute: false,
            solo: false,
          });
        }
      }

      if (!cancelled) {
        dispatch({ type: 'SET_TRACKS', tracks: loaded });
        dispatch({ type: 'SET_LOADING', loading: false });
        setLoadingProgress('');
      }
    }

    loadTracks();
    return () => {
      cancelled = true;
    };
  }, [trackInfos, publicationId, getAudioCtx, labels.loading_track]);

  // Playback animation loop
  const updatePlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !state.playback.playing) return;

    const elapsed = ctx.currentTime - state.playback.startedAt;
    const pos = state.playback.startOffset + elapsed;

    if (pos >= state.duration) {
      stopPlayback();
      return;
    }

    dispatch({ type: 'SET_PLAYBACK', playback: { position: pos } });

    // Update peak levels from analyser (simplified: use gain values)
    const newLevels = new Map<string, number>();
    for (const track of state.tracks) {
      if (track.mute || (!track.solo && state.tracks.some((t) => t.solo && t.id !== track.id))) {
        newLevels.set(track.id, 0);
      } else {
        // Approximate peak from current position in the buffer
        const level = peakLevelsRef.current.get(track.id) || 0;
        newLevels.set(track.id, level * 0.9 + Math.random() * 0.1 * track.volume);
      }
    }
    setPeakLevels(newLevels);

    animFrameRef.current = requestAnimationFrame(updatePlayback);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.playback.playing, state.playback.startedAt, state.playback.startOffset, state.duration, state.tracks]);

  useEffect(() => {
    if (state.playback.playing) {
      animFrameRef.current = requestAnimationFrame(updatePlayback);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [state.playback.playing, updatePlayback]);

  // Playback controls
  const startPlayback = useCallback(() => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    // Stop any existing playback
    sourceNodesRef.current.forEach((node) => {
      try { node.stop(); } catch { /* ignore */ }
    });
    sourceNodesRef.current.clear();
    gainNodesRef.current.clear();

    const hasSolo = state.tracks.some((t) => t.solo);

    for (const track of state.tracks) {
      if (!track.audioBuffer || track.regions.length === 0) continue;

      const shouldPlay = !track.mute && (!hasSolo || track.solo);
      const renderedBuffer = renderRegionsToBuffer(track.audioBuffer, track.regions, ctx);

      const source = ctx.createBufferSource();
      source.buffer = renderedBuffer;

      const gain = ctx.createGain();
      gain.gain.value = shouldPlay ? track.volume : 0;
      source.connect(gain);
      gain.connect(masterGainRef.current!);

      const offset = Math.min(state.playback.position, renderedBuffer.duration);
      source.start(0, offset);

      sourceNodesRef.current.set(track.id, source);
      gainNodesRef.current.set(track.id, gain);

      // Set initial peak level
      peakLevelsRef.current.set(track.id, shouldPlay ? 0.5 : 0);
    }

    // Update master gain
    masterGainRef.current!.gain.value = state.masterVolume;

    dispatch({
      type: 'SET_PLAYBACK',
      playback: {
        playing: true,
        startedAt: ctx.currentTime,
        startOffset: state.playback.position,
      },
    });
  }, [getAudioCtx, state.tracks, state.playback.position, state.masterVolume]);

  const stopPlayback = useCallback(() => {
    sourceNodesRef.current.forEach((node) => {
      try { node.stop(); } catch { /* ignore */ }
    });
    sourceNodesRef.current.clear();
    gainNodesRef.current.clear();

    dispatch({
      type: 'SET_PLAYBACK',
      playback: { playing: false },
    });

    // Reset peak levels
    const newLevels = new Map<string, number>();
    state.tracks.forEach((t) => newLevels.set(t.id, 0));
    setPeakLevels(newLevels);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlayback = useCallback(() => {
    if (state.playback.playing) {
      // Pause: capture current position
      const ctx = audioCtxRef.current;
      if (ctx) {
        const elapsed = ctx.currentTime - state.playback.startedAt;
        const pos = state.playback.startOffset + elapsed;
        dispatch({ type: 'SET_PLAYBACK', playback: { position: pos } });
      }
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [state.playback.playing, state.playback.startedAt, state.playback.startOffset, startPlayback, stopPlayback]);

  const handleStop = useCallback(() => {
    stopPlayback();
    dispatch({ type: 'SET_PLAYBACK', playback: { position: 0 } });
  }, [stopPlayback]);

  const handleRewind = useCallback(() => {
    if (state.playback.playing) {
      stopPlayback();
    }
    dispatch({ type: 'SET_PLAYBACK', playback: { position: 0 } });
  }, [state.playback.playing, stopPlayback]);

  // Mouse handlers for selection
  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (state.playback.playing) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = (x + state.scrollX) / state.zoom;

      isDraggingRef.current = true;
      dragStartTimeRef.current = Math.max(0, time);
      dispatch({ type: 'SET_SELECTION', selection: null });
    },
    [state.zoom, state.scrollX, state.playback.playing]
  );

  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingRef.current) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = Math.max(0, (x + state.scrollX) / state.zoom);

      const start = Math.min(dragStartTimeRef.current, time);
      const end = Math.max(dragStartTimeRef.current, time);

      if (end - start > 0.01) {
        dispatch({
          type: 'SET_SELECTION',
          selection: { start, end },
        });
      }
    },
    [state.zoom, state.scrollX]
  );

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // Click on timeline to seek
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = Math.max(0, (x + state.scrollX) / state.zoom);

      if (state.playback.playing) {
        stopPlayback();
      }
      dispatch({ type: 'SET_PLAYBACK', playback: { position: Math.min(time, state.duration) } });
    },
    [state.zoom, state.scrollX, state.duration, state.playback.playing, stopPlayback]
  );

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't handle if focused on an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        dispatch({ type: 'DELETE_SELECTION' });
      } else if (e.code === 'KeyX' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dispatch({ type: 'CUT_SELECTION' });
      } else if (e.code === 'KeyA' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dispatch({ type: 'SET_SELECTION', selection: { start: 0, end: state.duration } });
      } else if (e.code === 'Home') {
        e.preventDefault();
        dispatch({ type: 'SET_PLAYBACK', playback: { position: 0 } });
      } else if (e.code === 'End') {
        e.preventDefault();
        dispatch({ type: 'SET_PLAYBACK', playback: { position: state.duration } });
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        e.preventDefault();
        dispatch({ type: 'SET_ZOOM', zoom: state.zoom * 1.3 });
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        dispatch({ type: 'SET_ZOOM', zoom: state.zoom / 1.3 });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback, state.duration, state.zoom]);

  // Horizontal scroll via wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        dispatch({ type: 'SET_ZOOM', zoom: state.zoom * factor });
      } else {
        // Scroll
        dispatch({ type: 'SET_SCROLL_X', scrollX: state.scrollX + e.deltaX + e.deltaY });
      }
    },
    [state.zoom, state.scrollX]
  );

  // Save edited tracks
  const handleSave = useCallback(async () => {
    dispatch({ type: 'SET_SAVING', saving: true });
    setStatusMessage('');

    try {
      const ctx = getAudioCtx();

      for (const track of state.tracks) {
        if (!track.audioBuffer) continue;

        const renderedBuffer = renderRegionsToBuffer(track.audioBuffer, track.regions, ctx);
        const wavBlob = encodeWav(renderedBuffer);
        const fileName = `${track.name.replace(/\s+/g, '_')}.wav`;

        const formData = new FormData();
        formData.append('file', wavBlob, fileName);
        formData.append('publicationId', publicationId);
        formData.append('type', 'edited');
        formData.append('fileName', fileName);

        const resp = await fetch('/api/publikacja/upload', {
          method: 'POST',
          body: formData,
        });

        if (!resp.ok) {
          throw new Error(`Upload failed for ${track.name}`);
        }
      }

      // Update session status to edited
      await fetch(`/api/publikacja/sessions/${publicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edited_tracks: state.tracks
            .filter((t) => t.audioBuffer)
            .map((t) => ({
              name: `${t.name.replace(/\s+/g, '_')}.wav`,
              url: '', // Will be populated by the API
              size: 0,
            })),
        }),
      });

      setStatusMessage(labels.save_success);
    } catch (err) {
      console.error('Save failed:', err);
      setStatusMessage(labels.save_error);
    } finally {
      dispatch({ type: 'SET_SAVING', saving: false });
    }
  }, [getAudioCtx, state.tracks, publicationId, labels.save_success, labels.save_error]);

  // Export mixed WAV
  const handleExportMix = useCallback(async () => {
    const ctx = getAudioCtx();
    setStatusMessage(labels.export_progress);

    const hasSolo = state.tracks.some((t) => t.solo);
    const buffersToMix: { buffer: AudioBuffer; volume: number }[] = [];

    for (const track of state.tracks) {
      if (!track.audioBuffer || track.mute) continue;
      if (hasSolo && !track.solo) continue;

      const rendered = renderRegionsToBuffer(track.audioBuffer, track.regions, ctx);
      buffersToMix.push({ buffer: rendered, volume: track.volume });
    }

    const mixed = mixBuffers(buffersToMix, ctx);
    const blob = encodeWav(mixed);

    // Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mix_${publicationId.slice(0, 8)}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('');
  }, [getAudioCtx, state.tracks, publicationId, labels.export_progress]);

  // Export individual tracks
  const handleExportTracks = useCallback(() => {
    const ctx = getAudioCtx();
    setStatusMessage(labels.export_progress);

    for (const track of state.tracks) {
      if (!track.audioBuffer) continue;

      const rendered = renderRegionsToBuffer(track.audioBuffer, track.regions, ctx);
      const blob = encodeWav(rendered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${track.name.replace(/\s+/g, '_')}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setStatusMessage('');
  }, [getAudioCtx, state.tracks, labels.export_progress]);

  // Update master gain when volume changes
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = state.masterVolume;
    }
  }, [state.masterVolume]);

  // Update individual track gains during playback
  useEffect(() => {
    const hasSolo = state.tracks.some((t) => t.solo);
    for (const track of state.tracks) {
      const gain = gainNodesRef.current.get(track.id);
      if (!gain) continue;
      const shouldPlay = !track.mute && (!hasSolo || track.solo);
      gain.gain.value = shouldPlay ? track.volume : 0;
    }
  }, [state.tracks]);

  const waveformWidth = containerWidth - TRACK_PANEL_WIDTH;
  const totalTracksHeight = state.tracks.length * TRACK_HEIGHT;

  if (state.loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 rounded-xl"
        style={{
          backgroundColor: '#120f1e',
          minHeight: 400,
        }}
      >
        <Loader2 className="w-8 h-8 text-htg-lavender animate-spin" />
        <p className="text-sm text-[#8B7AAF]">{labels.loading}</p>
        {loadingProgress && (
          <p className="text-xs text-[#8B7AAF80]">{loadingProgress}</p>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden border"
      style={{
        backgroundColor: '#120f1e',
        borderColor: '#4A3B6B40',
      }}
    >
      {/* Toolbar */}
      <DawToolbar
        playing={state.playback.playing}
        position={state.playback.position}
        duration={state.duration}
        activeTool={state.activeTool}
        hasSelection={state.selection !== null}
        canUndo={state.history.length > 0}
        canRedo={state.future.length > 0}
        saving={state.saving}
        onPlay={togglePlayback}
        onStop={handleStop}
        onRewind={handleRewind}
        onZoomIn={() => dispatch({ type: 'SET_ZOOM', zoom: state.zoom * 1.5 })}
        onZoomOut={() => dispatch({ type: 'SET_ZOOM', zoom: state.zoom / 1.5 })}
        onToolChange={(tool) => dispatch({ type: 'SET_TOOL', tool })}
        onCut={() => dispatch({ type: 'CUT_SELECTION' })}
        onDelete={() => dispatch({ type: 'DELETE_SELECTION' })}
        onTrim={() => dispatch({ type: 'TRIM_TO_SELECTION' })}
        onFadeIn={() => dispatch({ type: 'APPLY_FADE_IN' })}
        onFadeOut={() => dispatch({ type: 'APPLY_FADE_OUT' })}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        onSave={handleSave}
        onExportMix={handleExportMix}
        onExportTracks={handleExportTracks}
        labels={labels}
      />

      {/* Timeline + tracks area */}
      <div
        className="relative overflow-hidden"
        onWheel={handleWheel}
        style={{ userSelect: 'none' }}
      >
        {/* Timeline ruler */}
        <div className="flex">
          <div
            style={{
              width: TRACK_PANEL_WIDTH,
              minWidth: TRACK_PANEL_WIDTH,
              backgroundColor: '#1a1528',
              borderRight: '1px solid #4A3B6B40',
              borderBottom: '1px solid #4A3B6B40',
            }}
          />
          <div
            className="flex-1 cursor-pointer"
            onClick={handleTimelineClick}
          >
            <DawTimeline
              duration={state.duration}
              zoom={state.zoom}
              scrollX={state.scrollX}
              width={Math.max(0, waveformWidth)}
            />
          </div>
        </div>

        {/* Tracks */}
        <div className="relative">
          {state.tracks.map((track) => (
            <DawTrack
              key={track.id}
              track={track}
              zoom={state.zoom}
              scrollX={state.scrollX}
              waveformWidth={Math.max(0, waveformWidth)}
              height={TRACK_HEIGHT}
              selection={state.selection}
              peakLevel={peakLevels.get(track.id) || 0}
              onVolumeChange={(v) =>
                dispatch({ type: 'SET_TRACK_VOLUME', trackId: track.id, volume: v })
              }
              onMuteToggle={() =>
                dispatch({ type: 'SET_TRACK_MUTE', trackId: track.id, mute: !track.mute })
              }
              onSoloToggle={() =>
                dispatch({ type: 'SET_TRACK_SOLO', trackId: track.id, solo: !track.solo })
              }
              onMouseDown={handleTrackMouseDown}
              onMouseMove={handleTrackMouseMove}
              labels={{ solo: labels.solo, mute: labels.mute }}
            />
          ))}

          {/* Selection overlay */}
          {state.selection && (
            <DawSelection
              start={state.selection.start}
              end={state.selection.end}
              zoom={state.zoom}
              scrollX={state.scrollX}
              height={totalTracksHeight}
              trackPanelWidth={TRACK_PANEL_WIDTH}
            />
          )}

          {/* Playhead */}
          <DawPlayhead
            position={state.playback.position}
            zoom={state.zoom}
            scrollX={state.scrollX}
            height={totalTracksHeight + 28}
            trackPanelWidth={TRACK_PANEL_WIDTH}
          />
        </div>
      </div>

      {/* Master controls */}
      <DawMasterControls
        volume={state.masterVolume}
        onVolumeChange={(v) => dispatch({ type: 'SET_MASTER_VOLUME', volume: v })}
        labels={{ master_volume: labels.master_volume }}
      />

      {/* Status message */}
      {statusMessage && (
        <div
          className="px-4 py-2 text-xs text-center border-t"
          style={{
            backgroundColor: '#1a1528',
            borderColor: '#4A3B6B40',
            color: statusMessage.includes('error') || statusMessage.includes('Blad') ? '#ef4444' : '#7A9E7E',
          }}
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
}
