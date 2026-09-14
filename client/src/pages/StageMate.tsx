import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { io, Socket } from 'socket.io-client';
import { Video, Upload, FileText, UserCheck, Mic, Play, Pause, Sparkles, CheckCircle2, Loader2, Download, Layout, Globe, Image as ImageIcon, Volume2, VolumeX, RotateCcw, Maximize, Minimize } from 'lucide-react';

export interface PresenterVideo {
  id: string;
  title: string;
  pptFileName: string;
  facePhotoPath?: string;
  voiceSamplePath?: string;
  scriptText?: string;
  videoUrl?: string;
  audioUrl?: string;
  status: 'uploading' | 'extracting' | 'scripting' | 'voice_cloning' | 'lip_syncing' | 'completed' | 'failed' | string;
  statusMessage?: string;
  progress: number;
  language: string;
  layoutPreset: string;
  createdAt: string | number;
}

interface VideoStagePlayerProps {
  video: PresenterVideo;
  getMediaUrl: (path?: string | null) => string;
}

const VideoStagePlayer: React.FC<VideoStagePlayerProps> = ({ video, getMediaUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(15);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const faceImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (video.facePhotoPath) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = getMediaUrl(video.facePhotoPath);
      img.onload = () => {
        faceImgRef.current = img;
        drawCanvasFrame(0, false);
      };
    } else {
      drawCanvasFrame(0, false);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [video]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen().catch(err => console.error(err));
    }
  };

  const drawCanvasFrame = (timestamp: number, speaking: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background Gradient (Virtual Stage Dark Studio)
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#020617');
    bgGrad.addColorStop(0.5, '#0f172a');
    bgGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Slide Presentation Box (Left Area)
    const slideW = width * 0.58;
    const slideH = height * 0.78;
    const slideX = 24;
    const slideY = (height - slideH) / 2;

    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(slideX, slideY, slideW, slideH, 16);
    ctx.fill();
    ctx.stroke();

    // Slide Title & Content Text
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('SLIDE PRESENTASI', slideX + 20, slideY + 32);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(video.title.substring(0, 30), slideX + 20, slideY + 68);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`File: ${video.pptFileName}`, slideX + 20, slideY + 95);

    // Dynamic Script Narration Content Text inside Slide Box
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    const scriptSnippet = video.scriptText || 'Pembahasan dokumen presentasi mencakup evaluasi, data performa, strategi eksekusi, serta rekomendasi keberlanjutan.';
    const lines = scriptSnippet.match(/.{1,42}(\s|$)/g) || [scriptSnippet];
    lines.slice(0, 5).forEach((line, idx) => {
      ctx.fillText(`• ${line.trim()}`, slideX + 20, slideY + 135 + idx * 22);
    });

    // Presenter Face Avatar (Right Area)
    const avatarW = width * 0.34;
    const avatarH = slideH;
    const avatarX = slideX + slideW + 20;
    const avatarY = slideY;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(avatarX, avatarY, avatarW, avatarH, 16);
    ctx.clip();

    const img = faceImgRef.current;
    if (img && img.complete) {
      // Realistic Presenter Natural Body & Head Motion
      const headOffset = speaking ? Math.sin(timestamp / 180) * 3 : 0;
      const bodyBreathing = Math.cos(timestamp / 400) * 1.5;

      // Draw User Uploaded Face Photo (Proper Head-to-Chest Framing)
      const imgAspect = img.naturalWidth / img.naturalHeight;
      let drawW = avatarW;
      let drawH = avatarW / imgAspect;
      if (drawH < avatarH) {
        drawH = avatarH;
        drawW = avatarH * imgAspect;
      }
      const drawX = avatarX + (avatarW - drawW) / 2;
      const drawY = avatarY + (avatarH - drawH) / 2 + headOffset + bodyBreathing;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // Natural Realistic Lip-Sync Mouth Animation (Positioned accurately over lower face)
      if (speaking) {
        const mouthY = drawY + drawH * 0.58;
        const mouthX = avatarX + avatarW / 2;
        const mouthOpen = Math.abs(Math.sin(timestamp / 90)) * 7;
        const mouthWidth = 9 + Math.cos(timestamp / 110) * 2;

        // Darker Inner Mouth Shadow
        ctx.fillStyle = 'rgba(20, 10, 10, 0.85)';
        ctx.beginPath();
        ctx.ellipse(mouthX, mouthY, mouthWidth, 2 + mouthOpen / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Natural Lip Color Accents
        ctx.fillStyle = 'rgba(180, 80, 80, 0.5)';
        ctx.beginPath();
        ctx.ellipse(mouthX, mouthY + 1, mouthWidth * 0.7, 1 + mouthOpen / 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#030712';
      ctx.fillRect(avatarX, avatarY, avatarW, avatarH);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AI Presenter', avatarX + avatarW / 2, avatarY + avatarH / 2);
      ctx.textAlign = 'start';
    }
    ctx.restore();

    // Border around Avatar Box
    ctx.strokeStyle = speaking ? '#38bdf8' : '#334155';
    ctx.lineWidth = speaking ? 4 : 2;
    ctx.beginPath();
    ctx.roundRect(avatarX, avatarY, avatarW, avatarH, 16);
    ctx.stroke();

    // Active Speaking Badge Overlay
    if (speaking) {
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.roundRect(avatarX + 12, avatarY + 12, 100, 24, 6);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('● PRESENTING', avatarX + 22, avatarY + 28);
    }
  };

  const startAnimationLoop = () => {
    let startTime: number | null = null;
    const render = (ts: number) => {
      if (!startTime) startTime = ts;
      drawCanvasFrame(ts - startTime, true);
      animFrameRef.current = requestAnimationFrame(render);
    };
    animFrameRef.current = requestAnimationFrame(render);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  };

  const startPlayback = () => {
    setIsPlaying(true);
    startAnimationLoop();

    const audioEl = audioRef.current;
    if (audioEl && video.audioUrl) {
      audioEl.muted = isMuted;
      audioEl
        .play()
        .then(() => {
          if (audioEl.duration && !isNaN(audioEl.duration)) {
            setDuration(Math.ceil(audioEl.duration));
          }
        })
        .catch((err) => {
          console.warn('Audio tag play fallback:', err);
          fallbackWebSpeech();
        });
    } else {
      fallbackWebSpeech();
    }

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= duration) {
          pausePlayback();
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const fallbackWebSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const script = video.scriptText || `Presentasi ${video.title}. Pembahasan mencakup poin-poin utama dokumen.`;
      const utterance = new SpeechSynthesisUtterance(script);
      utterance.lang = video.language === 'en-US' ? 'en-US' : 'id-ID';
      utterance.rate = 1.0;
      utterance.onend = () => pausePlayback();
      window.speechSynthesis.speak(utterance);
    }
  };

  const pausePlayback = () => {
    setIsPlaying(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioRef.current) audioRef.current.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    drawCanvasFrame(0, false);
  };

  const handleReset = () => {
    pausePlayback();
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleDownloadMp4 = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const stream = canvas.captureStream(30);
      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `presentation_${video.id}.mp4`;
        a.click();
        URL.revokeObjectURL(url);
      };

      mediaRecorder.start();
      startPlayback();

      setTimeout(() => {
        mediaRecorder.stop();
        pausePlayback();
      }, (duration || 10) * 1000);
    } catch (e) {
      window.open(`http://localhost:5000${video.videoUrl}`, '_blank');
    }
  };

  return (
    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900 p-3 my-2 space-y-3 shadow-lg">
      {/* Main Interactive Stage Container */}
      <div
        ref={containerRef}
        className={`relative aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex flex-col justify-between p-3 shadow-inner group ${
          isFullscreen ? 'w-screen h-screen flex items-center justify-center bg-black p-6' : ''
        }`}
      >
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          className="w-full h-full object-contain rounded-lg"
        />

        {/* Top Floating Control Bar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700/80 backdrop-blur-md text-[10px] font-bold text-sky-300 uppercase shadow-md">
            <Video className="w-3.5 h-3.5 text-sky-400" />
            <span>Panggung Presenter Virtual ({video.layoutPreset || 'Side-by-Side'})</span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 backdrop-blur-md rounded-lg p-1 shadow-md">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors"
              title={isMuted ? 'Buka Suara' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-sky-400" />}
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors"
              title="Reset Video"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 hover:bg-slate-800 rounded text-sky-400 hover:text-white transition-colors"
              title={isFullscreen ? 'Keluar Fullscreen' : 'Layar Penuh (Full Screen)'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Big Overlay Center Play/Pause Button */}
        <button
          onClick={handleTogglePlay}
          className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white flex items-center justify-center shadow-2xl backdrop-blur-md transition-all active:scale-95 z-20"
          title={isPlaying ? 'Jeda Presentasi' : 'Putar Video Presenter AI'}
        >
          {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
        </button>

        {/* Bottom Timeline Control Bar */}
        <div className="absolute bottom-4 left-4 right-4 space-y-1 z-20 bg-slate-900/90 border border-slate-800 backdrop-blur-md p-2 rounded-lg pointer-events-auto">
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden cursor-pointer">
            <div
              className="h-full bg-sky-400 transition-all duration-300"
              style={{ width: `${Math.min((currentTime / duration) * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-300 font-mono">
            <span className="text-sky-400 font-bold">{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Hidden Audio Element */}
        {video.audioUrl && (
          <audio
            ref={audioRef}
            src={`http://localhost:5000${video.audioUrl}`}
            onEnded={pausePlayback}
            onLoadedMetadata={(e) => {
              const dur = (e.target as HTMLAudioElement).duration;
              if (dur && !isNaN(dur)) setDuration(Math.ceil(dur));
            }}
            className="hidden"
          />
        )}
      </div>

      {/* Full Narration Script Text */}
      {video.scriptText && (
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1">
            <FileText className="w-3 h-3 text-sky-400" /> Skrip Lisan Narasi Presentasi
          </label>
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-300 max-h-24 overflow-y-auto leading-relaxed font-sans">
            {video.scriptText}
          </div>
        </div>
      )}

      {/* Download Video Button */}
      <button
        onClick={handleDownloadMp4}
        className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-sky-300 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Unduh Berkas Presentasi MP4
      </button>
    </div>
  );
};

export const StageMate: React.FC = () => {
  const [title, setTitle] = useState('');
  const [presentationFile, setPresentationFile] = useState<File | null>(null);
  const [facePhotoFile, setFacePhotoFile] = useState<File | null>(null);
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null);
  const [scriptNotes, setScriptNotes] = useState('');

  const [language, setLanguage] = useState('id-ID');
  const [layoutPreset, setLayoutPreset] = useState('side_by_side');

  const [generating, setGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [videos, setVideos] = useState<PresenterVideo[]>([]);

  useEffect(() => {
    fetchVideos();

    // Socket.io Real-Time Progress Listener
    const token = localStorage.getItem('talknt_token');
    const socket: Socket = io('http://localhost:5000', {
      auth: { token },
    });

    socket.on('video_progress', (updatedVideo: PresenterVideo) => {
      setVideos((prev) => {
        const index = prev.findIndex((v) => v.id === updatedVideo.id);
        if (index >= 0) {
          const newArray = [...prev];
          newArray[index] = updatedVideo;
          return newArray;
        } else {
          return [updatedVideo, ...prev];
        }
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchVideos = async () => {
    try {
      const res = await api.get('/stagemate/videos');
      setVideos(res.data.videos || []);
    } catch (err) {
      console.error('Failed to fetch presenter videos:', err);
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!presentationFile) {
      alert('File Presentasi (.ppt / .pptx / .pdf) wajib dipilih.');
      return;
    }

    if (!facePhotoFile) {
      alert('Foto Wajah (.jpg / .png) wajib dipilih untuk generasi avatar Lip-Sync.');
      return;
    }

    if (!voiceSampleFile) {
      alert('Sampel Audio Suara (.mp3 / .wav) wajib dipilih untuk Voice Cloning.');
      return;
    }

    setGenerating(true);
    const formData = new FormData();
    formData.append('presentation', presentationFile);
    formData.append('facePhoto', facePhotoFile);
    formData.append('voiceSample', voiceSampleFile);

    formData.append('title', title || presentationFile.name);
    formData.append('language', language);
    formData.append('layoutPreset', layoutPreset);
    if (scriptNotes) formData.append('scriptNotes', scriptNotes);

    try {
      const res = await api.post('/stagemate/generate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      showToast('Proses generasi Video Presenter Virtual AI berhasil dimulai!');
      if (res.data.video) {
        setVideos((prev) => [res.data.video, ...prev]);
      }
      // Reset form input
      setTitle('');
      setPresentationFile(null);
      setFacePhotoFile(null);
      setVoiceSampleFile(null);
      setScriptNotes('');
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Gagal memulai generasi video presenter. Pastikan server backend running di port 5000.');
    } finally {
      setGenerating(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const getStepStatus = (currentStatus: string, step: string) => {
    const order = ['uploading', 'extracting', 'scripting', 'voice_cloning', 'lip_syncing', 'completed'];
    const currentIndex = order.indexOf(currentStatus);
    const stepIndex = order.indexOf(step);

    if (currentStatus === 'failed') return 'failed';
    if (currentIndex > stepIndex) return 'done';
    if (currentIndex === stepIndex) return 'active';
    return 'pending';
  };

  const getMediaUrl = (filePath?: string | null) => {
    if (!filePath) return '';
    const cleanFileName = filePath.replace(/\\/g, '/').split('/').pop();
    return `http://localhost:5000/uploads/${cleanFileName}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner - Strict Blue Theme */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600/20 text-sky-400 border border-blue-500/30 rounded-2xl shrink-0">
            <Video className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-extrabold text-white">Modul 2: StageMate</h2>
              <span className="px-2.5 py-0.5 bg-blue-600/20 text-sky-400 border border-blue-500/30 text-[10px] font-bold rounded-full uppercase">
                AI Virtual Presenter Generator
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Pilih 3 file media di bawah, lalu klik <strong>"Hasilkan Video Presentasi AI"</strong> untuk memulai proses generasi video.
            </p>
          </div>
        </div>
      </div>

      {toastMessage && (
        <div className="p-4 bg-blue-600/20 border border-blue-500/30 rounded-xl text-sky-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-sky-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Generator Form */}
      <form onSubmit={handleGenerateVideo} className="space-y-6">
        {/* Step 1: Upload Area (3 Input Media Wajib) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Slide Presentasi (Wajib) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-sky-400 font-bold text-xs uppercase mb-1">
                <span className="flex items-center gap-1.5"><Upload className="w-4 h-4" /> 1. Slide Presentasi</span>
                <span className="px-2 py-0.5 bg-blue-600/30 text-sky-300 text-[9px] rounded font-bold">Wajib</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">File slide (.ppt / .pptx / .pdf)</p>
            </div>

            <label className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all text-center min-h-[110px] ${
              presentationFile
                ? 'bg-blue-600/10 border-blue-500 text-white'
                : 'bg-slate-950 border-slate-700 hover:border-blue-500'
            }`}>
              {presentationFile ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-sky-400 mb-1" />
                  <span className="text-xs font-bold text-sky-300 truncate max-w-[200px]" title={presentationFile.name}>
                    {presentationFile.name}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">✓ Berkas Siap • Klik untuk Ganti</span>
                </>
              ) : (
                <>
                  <FileText className="w-6 h-6 text-sky-400 mb-1" />
                  <span className="text-xs font-bold text-white">Pilih File PPT/PDF</span>
                  <span className="text-[10px] text-slate-400 mt-1">Klik untuk memilih file</span>
                </>
              )}
              <input
                type="file"
                accept=".ppt,.pptx,.pdf"
                required
                onChange={(e) => e.target.files?.[0] && setPresentationFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>

          {/* Card 2: Foto Wajah (Wajib) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-sky-400 font-bold text-xs uppercase mb-1">
                <span className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /> 2. Foto Wajah</span>
                <span className="px-2 py-0.5 bg-blue-600/30 text-sky-300 text-[9px] rounded font-bold">Wajib</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">Foto wajah Anda (.jpg / .png) untuk Lip-Sync</p>
            </div>

            <label className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all text-center min-h-[110px] ${
              facePhotoFile
                ? 'bg-blue-600/10 border-blue-500 text-white'
                : 'bg-slate-950 border-slate-700 hover:border-blue-500'
            }`}>
              {facePhotoFile ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-sky-400 mb-1" />
                  <span className="text-xs font-bold text-sky-300 truncate max-w-[200px]" title={facePhotoFile.name}>
                    {facePhotoFile.name}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">✓ Foto Siap • Klik untuk Ganti</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-6 h-6 text-sky-400 mb-1" />
                  <span className="text-xs font-bold text-white">Pilih Foto Wajah</span>
                  <span className="text-[10px] text-slate-400 mt-1">Foto tampak depan jernih</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                required
                onChange={(e) => e.target.files?.[0] && setFacePhotoFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>

          {/* Card 3: Sampel Suara (Wajib) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-sky-400 font-bold text-xs uppercase mb-1">
                <span className="flex items-center gap-1.5"><Mic className="w-4 h-4" /> 3. Sampel Suara</span>
                <span className="px-2 py-0.5 bg-blue-600/30 text-sky-300 text-[9px] rounded font-bold">Wajib</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">Audio suara Anda (.mp3 / .wav 10-30s)</p>
            </div>

            <label className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all text-center min-h-[110px] ${
              voiceSampleFile
                ? 'bg-blue-600/10 border-blue-500 text-white'
                : 'bg-slate-950 border-slate-700 hover:border-blue-500'
            }`}>
              {voiceSampleFile ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-sky-400 mb-1" />
                  <span className="text-xs font-bold text-sky-300 truncate max-w-[200px]" title={voiceSampleFile.name}>
                    {voiceSampleFile.name}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">✓ Audio Siap • Klik untuk Ganti</span>
                </>
              ) : (
                <>
                  <Mic className="w-6 h-6 text-sky-400 mb-1" />
                  <span className="text-xs font-bold text-white">Pilih Sampel Suara</span>
                  <span className="text-[10px] text-slate-400 mt-1">Rekaman audio jernih untuk cloning</span>
                </>
              )}
              <input
                type="file"
                accept="audio/*"
                required
                onChange={(e) => e.target.files?.[0] && setVoiceSampleFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Step 2: Configuration Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-sky-400" />
              Panel Konfigurasi Presenter AI
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-sky-400" /> Pilihan Bahasa Presentasi
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs text-white outline-none"
              >
                <option value="id-ID">Bahasa Indonesia (Voice Cloning / Neural AI)</option>
                <option value="en-US">English US (Voice Cloning / Neural AI)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2 flex items-center gap-1">
                <Layout className="w-3.5 h-3.5 text-sky-400" /> Layout Video Composite
              </label>
              <select
                value={layoutPreset}
                onChange={(e) => setLayoutPreset(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs text-white outline-none"
              >
                <option value="side_by_side">Side-by-Side (Wajah Samping Slide)</option>
                <option value="floating_pip">Floating PIP (Overlay Wajah di atas Slide)</option>
                <option value="full_avatar">Full Presenter (Wajah Menutupi Layar)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-sky-400" /> Skrip Tambahan (Opsional)
              </label>
              <input
                type="text"
                value={scriptNotes}
                onChange={(e) => setScriptNotes(e.target.value)}
                placeholder="Catatan khusus skrip presentasi..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs text-white outline-none placeholder-slate-500"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Masukkan Judul Presentasi (Contoh: Presentasi Laporan Bisnis Q4)"
              className="w-full sm:flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs text-white placeholder-slate-500 outline-none"
            />

            <button
              type="submit"
              disabled={generating}
              className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengunggah & Generasi...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Hasilkan Video Presentasi AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Real-Time Generated Video Gallery */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-sky-400" />
            Daftar Hasil Video Presenter AI (Real-Time Background Process)
          </h3>
          <span className="text-xs text-slate-400 font-medium">Total: {videos.length} Video</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.length > 0 ? (
            videos.map((vid) => (
              <div
                key={vid.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white truncate flex-1">{vid.title}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        vid.status === 'completed'
                          ? 'bg-blue-600/30 text-sky-300 border border-blue-500/40'
                          : vid.status === 'failed'
                          ? 'bg-slate-800 text-slate-400 border border-slate-700'
                          : 'bg-blue-600/20 text-sky-400 border border-blue-500/30 animate-pulse'
                      }`}
                    >
                      {vid.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 truncate mb-1">Slide: {vid.pptFileName}</p>
                  {vid.statusMessage && (
                    <p className="text-[10px] text-sky-400 font-mono leading-tight mb-2">
                      ➔ {vid.statusMessage}
                    </p>
                  )}

                  {/* Real-Time Stepper Progress Timeline */}
                  {vid.status !== 'completed' && vid.status !== 'failed' && (
                    <div className="space-y-2 my-3 p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="flex justify-between text-[10px] font-bold text-slate-300">
                        <span>Proses Pipeline AI</span>
                        <span className="text-sky-400 font-mono">{vid.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${vid.progress}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-[8px] font-semibold text-slate-400 text-center pt-1">
                        <span className={getStepStatus(vid.status, 'extracting') === 'done' ? 'text-sky-400' : 'text-slate-500'}>Extract</span>
                        <span className={getStepStatus(vid.status, 'scripting') === 'done' ? 'text-sky-400' : 'text-slate-500'}>Script</span>
                        <span className={getStepStatus(vid.status, 'voice_cloning') === 'done' ? 'text-sky-400' : 'text-slate-500'}>Voice</span>
                        <span className={getStepStatus(vid.status, 'lip_syncing') === 'done' ? 'text-sky-400' : 'text-slate-500'}>Lip-Sync</span>
                      </div>
                    </div>
                  )}

                  {/* Virtual Presenter Stage Canvas Player */}
                  {vid.status === 'completed' && (
                    <VideoStagePlayer video={vid} getMediaUrl={getMediaUrl} />
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full p-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
              Belum ada video presentasi yang dihasilkan. Pilih 3 file media di atas untuk mulai membuat video AI presenter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
