'use client';

import {
  Play, Pause, Square, SkipBack,
  ZoomIn, ZoomOut,
  Scissors, MousePointer,
  Undo2, Redo2,
  Save, Download,
} from 'lucide-react';
import type { DawTool } from '@/lib/daw/editor-state';

interface DawToolbarProps {
  playing: boolean;
  position: number;
  duration: number;
  activeTool: DawTool;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  onPlay: () => void;
  onStop: () => void;
  onRewind: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToolChange: (tool: DawTool) => void;
  onCut: () => void;
  onDelete: () => void;
  onTrim: () => void;
  onFadeIn: () => void;
  onFadeOut: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExportMix: () => void;
  onExportTracks: () => void;
  labels: {
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
  };
}

function formatTimeMs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function DawToolbar({
  playing,
  position,
  duration,
  activeTool,
  hasSelection,
  canUndo,
  canRedo,
  saving,
  onPlay,
  onStop,
  onRewind,
  onZoomIn,
  onZoomOut,
  onToolChange,
  onCut,
  onDelete,
  onTrim,
  onFadeIn,
  onFadeOut,
  onUndo,
  onRedo,
  onSave,
  onExportMix,
  onExportTracks,
  labels,
}: DawToolbarProps) {
  const btnBase =
    'flex items-center justify-center w-9 h-9 rounded-lg transition-colors text-sm';
  const btnNormal = `${btnBase} bg-[#2d2a3e] text-[#8B7AAF] hover:bg-[#3d3a5e] hover:text-white`;
  const btnActive = `${btnBase} bg-htg-sage text-white`;
  const btnDisabled = `${btnBase} bg-[#2d2a3e] text-[#4A3B6B] cursor-not-allowed`;

  return (
    <div
      className="flex items-center gap-1 px-3 py-2 border-b flex-wrap"
      style={{
        backgroundColor: '#1a1528',
        borderColor: '#4A3B6B40',
      }}
    >
      {/* Transport */}
      <div className="flex items-center gap-1 mr-3">
        <button onClick={onRewind} className={btnNormal} title={labels.rewind}>
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={onPlay}
          className={playing ? btnActive : btnNormal}
          title={playing ? labels.pause : labels.play}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button onClick={onStop} className={btnNormal} title={labels.stop}>
          <Square className="w-4 h-4" />
        </button>
      </div>

      {/* Time display */}
      <div
        className="font-mono text-xs px-3 py-1.5 rounded-lg mr-3 select-none"
        style={{ backgroundColor: '#0a0816', color: '#D4A76A' }}
      >
        {formatTimeMs(position)} / {formatTimeMs(duration)}
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-1 mr-3">
        <button onClick={onZoomIn} className={btnNormal} title={labels.zoom_in}>
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={onZoomOut} className={btnNormal} title={labels.zoom_out}>
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* Tools */}
      <div className="flex items-center gap-1 mr-3">
        <button
          onClick={() => onToolChange('select')}
          className={activeTool === 'select' ? btnActive : btnNormal}
          title={labels.select}
        >
          <MousePointer className="w-4 h-4" />
        </button>
        <button
          onClick={onCut}
          className={hasSelection ? btnNormal : btnDisabled}
          disabled={!hasSelection}
          title={labels.cut}
        >
          <Scissors className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className={hasSelection ? btnNormal : btnDisabled}
          disabled={!hasSelection}
          title={labels.delete}
        >
          <span className="text-[10px] font-bold">DEL</span>
        </button>
        <button
          onClick={onTrim}
          className={hasSelection ? btnNormal : btnDisabled}
          disabled={!hasSelection}
          title={labels.trim}
        >
          <span className="text-[10px] font-bold">TRIM</span>
        </button>
        <button
          onClick={onFadeIn}
          className={hasSelection ? btnNormal : btnDisabled}
          disabled={!hasSelection}
          title={labels.fade_in}
        >
          <span className="text-[10px] font-bold">FI</span>
        </button>
        <button
          onClick={onFadeOut}
          className={hasSelection ? btnNormal : btnDisabled}
          disabled={!hasSelection}
          title={labels.fade_out}
        >
          <span className="text-[10px] font-bold">FO</span>
        </button>
      </div>

      {/* Undo/Redo */}
      <div className="flex items-center gap-1 mr-3">
        <button
          onClick={onUndo}
          className={canUndo ? btnNormal : btnDisabled}
          disabled={!canUndo}
          title={labels.undo}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          className={canRedo ? btnNormal : btnDisabled}
          disabled={!canRedo}
          title={labels.redo}
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Save/Export */}
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={onSave}
          disabled={saving}
          className={saving ? btnDisabled : btnNormal}
          title={saving ? labels.saving : labels.save}
        >
          <Save className="w-4 h-4" />
        </button>
        <button onClick={onExportMix} className={btnNormal} title={labels.export_mix}>
          <Download className="w-4 h-4" />
        </button>
        <button onClick={onExportTracks} className={btnNormal} title={labels.export_tracks}>
          <span className="text-[10px] font-bold">WAV</span>
        </button>
      </div>
    </div>
  );
}
