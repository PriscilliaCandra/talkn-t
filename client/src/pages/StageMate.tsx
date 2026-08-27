import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { io, Socket } from 'socket.io-client';
import { Video, Upload, FileText, UserCheck, Mic, Play, Sparkles, CheckCircle2, AlertCircle, Loader2, Download, Layout, Globe } from 'lucide-react';

export interface PresenterVideo {
  id: string;
  title: string;
  pptFileName: string;
  facePhotoPath?: string;
  voiceSamplePath?: string;
  videoUrl?: string;
  status: 'processing' | 'completed' | 'failed' | string;
  progress: number;
  language: string;
  layoutPreset: string;
  createdAt: string | number;
}

export const StageMate: React.FC = () => {
  const [title, setTitle] = useState('');
  const [presentationFile, setPresentationFile] = useState<File | null>(null);
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [facePhotoFile, setFacePhotoFile] = useState<File | null>(null);
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null);

  const [language, setLanguage] = useState('id-ID');
  const [layoutPreset, setLayoutPreset] = useState('side_by_side');
  const [voiceOption, setVoiceOption] = useState('default');
  const [faceOption, setFaceOption] = useState('default');

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
      alert('File presentasi (.ppt / .pptx) wajib diunggah.');
      return;
    }

    setGenerating(true);
    const formData = new FormData();
    formData.append('presentation', presentationFile);
    if (scriptFile) formData.append('script', scriptFile);
    if (facePhotoFile) formData.append('facePhoto', facePhotoFile);
    if (voiceSampleFile) formData.append('voiceSample', voiceSampleFile);

    formData.append('title', title || presentationFile.name);
    formData.append('language', language);
    formData.append('layoutPreset', layoutPreset);

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
      setScriptFile(null);
      setFacePhotoFile(null);
      setVoiceSampleFile(null);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Gagal memulai generasi video presenter.');
    } finally {
      setGenerating(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl shrink-0">
            <Video className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-extrabold text-slate-100">Modul 2: StageMate</h2>
              <span className="px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold rounded-full uppercase">
                AI Virtual Presenter Generator
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Ubah slide presentasi PPTX menjadi video presenter virtual AI dengan wajah & suara hasil cloning
            </p>
          </div>
        </div>
      </div>

      {toastMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Generator Form */}
      <form onSubmit={handleGenerateVideo} className="space-y-6">
        {/* Step 1: Upload Area (3 Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Slide Presentasi (Wajib) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
              <Upload className="w-4 h-4" />
              <span>1. File Presentasi (Wajib)</span>
            </div>
            <p className="text-xs text-slate-400">Unggah slide presentasi (.ppt / .pptx / .pdf)</p>
            <label className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center bg-slate-950/60 min-h-[110px]">
              <FileText className="w-6 h-6 text-indigo-400 mb-1" />
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[200px]">
                {presentationFile ? presentationFile.name : 'Pilih File PPT/PPTX'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">Klik untuk mengunggah</span>
              <input
                type="file"
                accept=".ppt,.pptx,.pdf"
                required
                onChange={(e) => e.target.files?.[0] && setPresentationFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>

          {/* Card 2: Skrip Teks (Opsional) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center gap-2 text-brand-400 font-bold text-sm">
              <FileText className="w-4 h-4" />
              <span>2. Skrip Teks (Opsional)</span>
            </div>
            <p className="text-xs text-slate-400">Unggah skrip teks (.txt / .docx) jika ada</p>
            <label className="border-2 border-dashed border-slate-700 hover:border-brand-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center bg-slate-950/60 min-h-[110px]">
              <FileText className="w-6 h-6 text-brand-400 mb-1" />
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[200px]">
                {scriptFile ? scriptFile.name : 'Pilih File Skrip'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">Biarkan kosong jika gunakan AI</span>
              <input
                type="file"
                accept=".txt,.docx"
                onChange={(e) => e.target.files?.[0] && setScriptFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>

          {/* Card 3: Sampel Wajah & Suara Cloning (Opsional) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <UserCheck className="w-4 h-4" />
              <span>3. Wajah & Suara Cloning</span>
            </div>
            <p className="text-xs text-slate-400">Unggah foto wajah & audio suara untuk cloning</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="border border-slate-800 hover:border-emerald-500 rounded-xl p-2 flex flex-col items-center justify-center cursor-pointer text-center bg-slate-950/60 text-[10px]">
                <UserCheck className="w-4 h-4 text-emerald-400 mb-0.5" />
                <span className="truncate max-w-[80px] font-medium text-slate-200">
                  {facePhotoFile ? facePhotoFile.name : 'Foto Wajah'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setFacePhotoFile(e.target.files[0]);
                      setFaceOption('custom');
                    }
                  }}
                  className="hidden"
                />
              </label>

              <label className="border border-slate-800 hover:border-emerald-500 rounded-xl p-2 flex flex-col items-center justify-center cursor-pointer text-center bg-slate-950/60 text-[10px]">
                <Mic className="w-4 h-4 text-emerald-400 mb-0.5" />
                <span className="truncate max-w-[80px] font-medium text-slate-200">
                  {voiceSampleFile ? voiceSampleFile.name : 'Suara MP3'}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setVoiceSampleFile(e.target.files[0]);
                      setVoiceOption('custom');
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Step 2: Configuration Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Panel Konfigurasi Presenter AI
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-indigo-400" /> Pilihan Bahasa
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-slate-200 outline-none"
              >
                <option value="id-ID">Bahasa Indonesia (Neural AI)</option>
                <option value="en-US">English US (Neural AI)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2 flex items-center gap-1">
                <Mic className="w-3.5 h-3.5 text-emerald-400" /> Pilihan Suara
              </label>
              <select
                value={voiceOption}
                onChange={(e) => setVoiceOption(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-slate-200 outline-none"
              >
                <option value="default">Default AI Voice (Ardi Neural)</option>
                <option value="custom">Cloning Suara Pengguna (Audio Sample)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-brand-400" /> Pilihan Wajah
              </label>
              <select
                value={faceOption}
                onChange={(e) => setFaceOption(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-slate-200 outline-none"
              >
                <option value="default">Default AI Avatar Presenter</option>
                <option value="custom">Foto Wajah Pengguna (Face Photo)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2 flex items-center gap-1">
                <Layout className="w-3.5 h-3.5 text-amber-400" /> Layout Video
              </label>
              <select
                value={layoutPreset}
                onChange={(e) => setLayoutPreset(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-slate-200 outline-none"
              >
                <option value="side_by_side">Wajah Samping Slide (Side-by-Side)</option>
                <option value="floating_pip">Floating PIP (Overlay Wajah di Slide)</option>
                <option value="full_avatar">Full Presenter Avatar (Layar Penuh)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Masukkan Judul Presentasi (Contoh: Laporan Penjualan Q3)"
              className="w-full sm:flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 outline-none"
            />

            <button
              type="submit"
              disabled={generating}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-600 to-brand-600 hover:from-indigo-500 hover:to-brand-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memulai Generasi...</span>
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
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Video className="w-5 h-5 text-brand-400" />
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
                    <span className="text-xs font-bold text-slate-100 truncate flex-1">{vid.title}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        vid.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : vid.status === 'failed'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                      }`}
                    >
                      {vid.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 truncate mb-2">Slide: {vid.pptFileName}</p>

                  {/* Progress Bar saat Processing */}
                  {vid.status === 'processing' && (
                    <div className="space-y-1 my-3">
                      <div className="flex justify-between text-[10px] text-amber-400 font-medium">
                        <span>Memproses Video AI...</span>
                        <span>{vid.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-indigo-500 transition-all duration-300"
                          style={{ width: `${vid.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Video Player saat Completed */}
                  {vid.status === 'completed' && vid.videoUrl && (
                    <div className="rounded-lg overflow-hidden border border-slate-800 bg-black aspect-video my-2">
                      <video
                        controls
                        src={`http://localhost:5000${vid.videoUrl}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>

                {vid.status === 'completed' && vid.videoUrl && (
                  <a
                    href={`http://localhost:5000${vid.videoUrl}`}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh Video MP4
                  </a>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-full p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              Belum ada video presentasi yang dihasilkan. Unggah slide PPT untuk memulai generasi video AI presenter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
