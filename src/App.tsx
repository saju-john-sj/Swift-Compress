/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import { 
  Upload, 
  Video, 
  Download, 
  Settings2, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  FileVideo,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

// --- Types ---

interface VideoMetadata {
  name: string;
  size: number;
  type: string;
  duration: number;
}

interface CompressionSettings {
  crf: number;
  preset: string;
  scale: string;
  targetSize: number; // in MB
  useTargetSize: boolean;
}

// --- Constants ---

const PRESETS = [
  { value: 'ultrafast', label: 'Ultra Fast' },
  { value: 'superfast', label: 'Super Fast' },
  { value: 'veryfast', label: 'Very Fast' },
  { value: 'faster', label: 'Faster' },
  { value: 'fast', label: 'Fast' },
  { value: 'medium', label: 'Medium' },
];

const SCALES = [
  { value: 'original', label: 'Original' },
  { value: '7680:-2', label: '8K (Ultra HD)' },
  { value: '3840:-2', label: '4K (Ultra HD)' },
  { value: '1920:-2', label: '1080p (Full HD)' },
  { value: '1280:-2', label: '720p (HD)' },
  { value: '854:-2', label: '480p (SD)' },
  { value: '640:-2', label: '360p' },
];

export default function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Starting engine...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCompatibilityMode, setIsCompatibilityMode] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [progress, setProgress] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [settings, setSettings] = useState<CompressionSettings>({
    crf: 28,
    preset: 'veryfast',
    scale: 'original',
    targetSize: 10,
    useTargetSize: false,
  });

  const [isDragging, setIsDragging] = useState(false);

  const ffmpegRef = useRef<any>(null);

  // --- FFmpeg Initialization ---

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async (forceMT = false) => {
    if (ffmpegRef.current && isLoaded && !forceMT) return;

    setIsLoading(true);
    setLoadError(null);
    setLoadingProgress(10);
    setLoadingStatus('Initializing engine...');
    
    const timeoutDuration = 60000;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Loading timed out after ${timeoutDuration/1000}s. This usually happens due to browser restrictions.`)), timeoutDuration)
    );

    try {
      // Check if we can use MT, but default to single-threaded for stability
      const canUseMT = typeof SharedArrayBuffer !== 'undefined';
      
      // If forceMT is requested but not possible, warn and fallback
      if (forceMT && !canUseMT) {
        toast.error('High-performance mode requires a secure context. Try "Open in New Tab".');
        forceMT = false;
      }

      const useMT = forceMT; // Only use MT if explicitly forced
      setIsCompatibilityMode(!useMT);

      const ffmpegInstance = createFFmpeg({ 
        log: true,
        corePath: useMT 
          ? 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.11.0/dist/ffmpeg-core.js'
          : 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
      });
      
      ffmpegInstance.setProgress(({ ratio }) => {
        setProgress(Math.round(ratio * 100));
      });

      setLoadingStatus(useMT ? 'Loading high-performance core...' : 'Loading compatible core...');
      setLoadingProgress(40);

      await Promise.race([
        ffmpegInstance.load(),
        timeoutPromise
      ]);

      ffmpegRef.current = ffmpegInstance;
      setIsLoaded(true);
      setLoadingProgress(100);
      toast.success(useMT ? 'High-performance engine ready!' : 'Compatible engine ready!');
    } catch (error) {
      console.error('[FFmpeg Init Error]:', error);
      
      // If MT failed, try falling back to single-threaded automatically
      if (forceMT) {
        console.log('High-performance load failed, falling back to compatibility mode...');
        toast.info('Falling back to compatibility mode...');
        await loadFFmpeg(false);
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      setLoadError(`Initialization failed: ${message}`);
      toast.error('Failed to start video engine.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isLoading) return;

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processSelectedFile(droppedFile);
    }
  };

  const processSelectedFile = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('video/')) {
      toast.error('Please select a valid video file.');
      return;
    }

    // Extract duration
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      setMetadata({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        duration: video.duration,
      });
      // Default target size to 50% of original, but capped at 2GB for browser safety
      const originalSizeMB = selectedFile.size / (1024 * 1024);
      setSettings(s => ({ 
        ...s, 
        targetSize: Math.round(Math.min(2000, originalSizeMB * 0.5)) 
      }));
    };
    video.src = URL.createObjectURL(selectedFile);

    if (selectedFile.size > 2 * 1024 * 1024 * 1024) {
      toast.warning('Large file detected! Browser memory limits (2GB-4GB) may cause a crash. For 10GB files, a desktop app is recommended.', {
        duration: 10000,
      });
    }

    setFile(selectedFile);
    setCompressedBlob(null);
    setProgress(0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processSelectedFile(selectedFile);
    }
  };

  const compressVideo = async () => {
    if (!ffmpegRef.current || !file) return;

    setIsCompressing(true);
    setProgress(0);
    setCompressedBlob(null);

    const ffmpeg = ffmpegRef.current;
    const inputName = 'input.mp4';
    const outputName = 'output.mp4';

    try {
      ffmpeg.FS('writeFile', inputName, await fetchFile(file));

      let args = [
        '-i', inputName,
        '-vcodec', 'libx264',
        '-threads', '0', // Auto-detect threads
      ];

      if (settings.useTargetSize && metadata?.duration) {
        const targetBitrate = Math.floor((settings.targetSize * 1024 * 1024 * 8) / metadata.duration);
        args.push('-b:v', `${targetBitrate}`, '-maxrate', `${targetBitrate * 1.5}`, '-bufsize', `${targetBitrate * 2}`);
      } else {
        args.push('-crf', settings.crf.toString());
      }

      args.push('-preset', settings.preset);

      if (settings.scale !== 'original') {
        args.push('-vf', `scale=${settings.scale}`);
      }

      args.push(outputName);

      await ffmpeg.run(...args);

      const data = ffmpeg.FS('readFile', outputName);
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      setCompressedBlob(blob);
      toast.success('Compression complete!');
    } catch (error) {
      console.error('Compression error:', error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ArrayBuffer') || message.includes('memory')) {
        toast.error('Memory limit exceeded! The file is too large for your browser to process. Try a smaller file or a desktop app.');
      } else {
        toast.error('An error occurred during compression. For large files, try opening the app in a new tab.');
      }
    } finally {
      setIsCompressing(false);
    }
  };

  const downloadVideo = () => {
    if (!compressedBlob || !metadata) return;
    const url = URL.createObjectURL(compressedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compressed_${metadata.name.split('.')[0]}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // --- UI Components ---

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Toaster position="top-center" />
      
      {/* Header */}
      <header className="h-16 bg-white border-b border-border flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-2 text-[#0052cc] font-bold text-xl tracking-tight">
          <Video className="w-6 h-6 stroke-[3px]" />
          SwiftCompress
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#e3fcef] text-[#006644] text-[13px] font-semibold">
          <div className="w-2 h-2 rounded-full bg-[#36b37e]" />
          OFFLINE READY
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 p-6 overflow-hidden">
        {/* Canvas Area */}
        <div className="flex flex-col gap-5 overflow-hidden">
          {loadError && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <p>{loadError}</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="bg-white border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  Open in New Tab
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadFFmpeg}
                  className="bg-white border-red-200 text-red-700 hover:bg-red-50"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {!file ? (
            <div 
              className={`flex-1 bg-white border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all group relative ${
                isDragging 
                  ? 'border-primary bg-primary/5 scale-[0.99]' 
                  : 'border-[#0052cc] hover:bg-[#f0f5ff]'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input 
                id="video-upload"
                type="file" 
                accept="video/*" 
                className="hidden" 
                onChange={handleFileChange}
              />
              
              <div className={`flex flex-col items-center transition-opacity duration-300 ${isLoading ? 'opacity-40' : 'opacity-100'}`}>
                <div 
                  className="w-16 h-16 rounded-full bg-[#deebff] flex items-center justify-center mb-5 text-[#0052cc] group-hover:scale-110 transition-transform cursor-pointer"
                  onClick={() => !isLoading && document.getElementById('video-upload')?.click()}
                >
                  {isLoading ? (
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {isLoading ? loadingStatus : 'Drag & Drop Videos'}
                </h2>
                <p className="text-muted-foreground text-sm max-w-[300px] leading-relaxed">
                  {isLoading 
                    ? 'Please wait while we prepare the video compression engine. This may take a moment depending on your connection.' 
                    : 'Supports MP4, MOV, WEBM, and AVI. Compression is performed locally in your browser.'}
                </p>
              </div>

              {isLoading && (
                <div className="mt-8 flex flex-col gap-3 w-full max-w-[260px] z-10">
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-1">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${loadingProgress}%` }}
                      className="h-full bg-primary"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">Troubleshooting</p>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="text-xs font-bold bg-[#0052cc] hover:bg-[#0047b3] text-white"
                  >
                    Open in New Tab (Fixes Most Issues)
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      loadFFmpeg(true);
                    }}
                    className="text-xs font-bold"
                  >
                    Try High-Performance Mode
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      loadFFmpeg(false);
                    }}
                    className="text-xs text-muted-foreground hover:bg-transparent"
                  >
                    Force Restart Engine
                  </Button>
                </div>
              )}
              
              {!isLoading && (
                <Button 
                  variant="link" 
                  className="mt-4 text-[#0052cc] font-bold"
                  onClick={() => document.getElementById('video-upload')?.click()}
                >
                  Or browse files
                </Button>
              )}
            </div>
          ) : (
            <div className="flex-1 bg-white border border-border rounded-lg p-6 flex flex-col gap-6 overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Queue (1)</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setFile(null)}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-white">
                <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <FileVideo className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{metadata?.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(metadata?.size || 0)} &bull; Video File</p>
                </div>
                <div className="text-right shrink-0">
                  {isCompressing ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground">Compressing... {progress}%</p>
                      <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-300" 
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  ) : compressedBlob ? (
                    <Badge className="bg-[#e3fcef] text-[#006644] border-none">Completed</Badge>
                  ) : (
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Waiting</p>
                  )}
                </div>
              </div>

              {isCompressing && (
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-100 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-blue-900">
                        {isCompatibilityMode ? 'Running in Compatibility Mode' : 'Running in High-Performance Mode'}
                      </p>
                      <p className="text-xs text-blue-800 leading-relaxed">
                        {isCompatibilityMode 
                          ? 'Your browser is restricting the engine to a single core. For 10x faster speed, click "Open in New Tab" at the top right.' 
                          : 'Using multi-core processing for maximum speed. Keep this tab active to prevent throttling.'}
                      </p>
                    </div>
                  </div>
                  {(metadata?.size || 0) > 1.5 * 1024 * 1024 * 1024 && (
                    <div className="p-3 rounded bg-amber-50 border border-amber-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-800 leading-tight font-medium">
                        <strong>Large File Warning:</strong> Browsers have a ~2GB-4GB memory limit. If the tab crashes, please try a smaller file or use a desktop application.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {compressedBlob && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-auto p-6 rounded-xl bg-[#e3fcef] border border-[#abf5d1] flex flex-col items-center gap-4"
                >
                  <CheckCircle2 className="w-10 h-10 text-[#006644]" />
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#006644]">Compression Complete!</p>
                    <p className="text-sm text-[#006644]/80">Your video is ready for download.</p>
                  </div>
                  <Button 
                    className="w-full bg-[#006644] hover:bg-[#004d33] text-white font-bold h-12 rounded-lg"
                    onClick={downloadVideo}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Result
                  </Button>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="bg-white border border-border rounded-lg p-6 flex flex-col gap-8 shadow-sm overflow-y-auto max-h-[calc(100vh-120px)]">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6">Output Settings</h3>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[13px] font-bold">Target Resolution</label>
                <div className="grid grid-cols-1 gap-2">
                  {SCALES.map((scale) => (
                    <button
                      key={scale.value}
                      onClick={() => setSettings(s => ({ ...s, scale: scale.value }))}
                      className={`px-4 py-2.5 rounded border text-sm font-medium text-left transition-all ${
                        settings.scale === scale.value 
                          ? 'bg-[#deebff] text-[#0052cc] border-[#0052cc]' 
                          : 'bg-[#fafbfc] text-foreground border-border hover:border-muted-foreground'
                      }`}
                    >
                      {scale.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-bold">Mode</label>
                  <div className="flex bg-secondary rounded p-0.5">
                    <button 
                      onClick={() => setSettings(s => ({ ...s, useTargetSize: false }))}
                      className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${!settings.useTargetSize ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}
                    >
                      QUALITY
                    </button>
                    <button 
                      onClick={() => setSettings(s => ({ ...s, useTargetSize: true }))}
                      className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${settings.useTargetSize ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}
                    >
                      SIZE
                    </button>
                  </div>
                </div>
              </div>

              {settings.useTargetSize ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-bold">Target Size (MB)</label>
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{settings.targetSize} MB</span>
                  </div>
                  <Slider 
                    value={[settings.targetSize]} 
                    min={1} 
                    max={Math.max(10000, Math.round((metadata?.size || 0) / (1024 * 1024)))} 
                    step={1} 
                    onValueChange={(val: number[]) => setSettings(s => ({ ...s, targetSize: val[0] }))}
                    className="py-2"
                  />
                  <div className="flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-tight">
                    <span>Small</span>
                    <span>Large</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-bold">Compression Level</label>
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{settings.crf}</span>
                  </div>
                  <Slider 
                    value={[settings.crf]} 
                    min={18} 
                    max={40} 
                    step={1} 
                    onValueChange={(val: number[]) => setSettings(s => ({ ...s, crf: val[0] }))}
                    className="py-2"
                  />
                  <div className="flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-tight">
                    <span>Fast / Low</span>
                    <span>Slow / High</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[13px] font-bold">Speed Preset</label>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setSettings(s => ({ ...s, preset: preset.value }))}
                      className={`px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider border transition-all ${
                        settings.preset === preset.value 
                          ? 'bg-primary text-white border-primary' 
                          : 'bg-secondary text-muted-foreground border-border hover:border-muted-foreground'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-border">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Estimated Result</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Original Size</span>
                <span className="font-bold">{file ? formatSize(metadata?.size || 0) : '0 MB'}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Compressed Size</span>
                <span className="font-bold text-[#006644]">
                  {file ? (
                    settings.useTargetSize 
                      ? `~${settings.targetSize} MB`
                      : `~${formatSize((metadata?.size || 0) * (1 - (settings.crf - 18) / 40))}`
                  ) : '0 MB'}
                </span>
              </div>
              {file && (
                <div className="text-[12px] text-[#006644] font-bold mt-3">
                  &darr; {settings.useTargetSize 
                    ? Math.round((1 - (settings.targetSize / ((metadata?.size || 0) / (1024 * 1024)))) * 100)
                    : Math.round(((settings.crf - 18) / 40) * 100)}% Space Savings
                </div>
              )}
            </div>

            <Button 
              className="w-full mt-6 h-12 bg-[#0052cc] hover:bg-[#0047b3] text-white font-bold rounded shadow-sm disabled:opacity-50"
              disabled={!file || isCompressing || !isLoaded}
              onClick={compressVideo}
            >
              {isCompressing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : !isLoaded ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2 fill-current" />
              )}
              {isCompressing 
                ? 'Processing...' 
                : !isLoaded 
                  ? 'Initializing Engine...' 
                  : 'Start Processing'}
            </Button>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="h-12 bg-white border-t border-border px-8 flex items-center justify-between text-[12px] text-muted-foreground shrink-0">
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5">
            <kbd className="bg-secondary border border-border px-1.5 py-0.5 rounded font-mono text-[10px]">Ctrl</kbd> + 
            <kbd className="bg-secondary border border-border px-1.5 py-0.5 rounded font-mono text-[10px]">O</kbd> Open Files
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="bg-secondary border border-border px-1.5 py-0.5 rounded font-mono text-[10px]">Esc</kbd> Clear Queue
          </span>
        </div>
        <div className="flex items-center gap-2">
          Local Engine v4.2.0-stable &bull; No Data Leaves This Device
        </div>
      </footer>
    </div>
  );
}
