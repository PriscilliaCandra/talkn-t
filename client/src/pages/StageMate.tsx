import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { io, Socket } from 'socket.io-client';
import { Video, Upload, FileText, UserCheck, Mic, Play, Sparkles, CheckCircle2, Loader2, Download, Layout, Globe, Image as ImageIcon } from 'lucide-react';

export interface PresenterVideo {
  id: string;
  title: string;
  pptFileName: string;
  facePhotoPath?: string;
  voiceSamplePath?: string;
  scriptText?: string;
  videoUrl?: string;
  status: 'uploading' | 'extracting' | 'scripting' | 'voice_cloning' | 'lip_syncing' | 'completed' | 'failed' | string;
  statusMessage?: string;
  progress: number;
  language: string;
  layoutPreset: string;
  createdAt: string | number;
}

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
      alert('File Presentasi (.ppt / .pptx / .pdf) wajib diunggah.');
      return;
    }

    if (!facePhotoFile) {
      alert('Foto Wajah (.jpg / .png) wajib diunggah untuk generasi avatar Lip-Sync.');
      return;
    }

    if (!voiceSampleFile) {
      alert('Sampel Audio Suara (.mp3 / .wav) wajib diunggah untuk Voice Cloning.');
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
      alert(err?.response?.data?.error || 'Gagal memulai generasi video presenter.');
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
              Hasilkan video presentasi profesional di mana wajah & suara Anda sendiri tampil membacakan slide
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
            <label className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center bg-slate-950 min-h-[110px]">
              <FileText className="w-6 h-6 text-sky-400 mb-1" />
              <span className="text-xs font-bold text-white truncate max-w-[200px]">
                {presentationFile ? presentationFile.name : 'Unggah File PPT/PDF'}
              </span>
              <span className="text-[10px] text-slate-400 mt-1">Klik untuk memilih file</span>
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
            <label className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center bg-slate-950 min-h-[110px]">
              <UserCheck className="w-6 h-6 text-sky-400 mb-1" />
              <span className="text-xs font-bold text-white truncate max-w-[200px]">
                {facePhotoFile ? facePhotoFile.name : 'Unggah Foto Wajah'}
              </span>
              <span className="text-[10px] text-slate-400 mt-1">Foto tampak depan jernih</span>
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
            <label className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center bg-slate-950 min-h-[110px]">
              <Mic className="w-6 h-6 text-sky-400 mb-1" />
              <span className="text-xs font-bold text-white truncate max-w-[200px]">
                {voiceSampleFile ? voiceSampleFile.name : 'Unggah Sampel Suara'}
              </span>
              <span className="text-[10px] text-slate-400 mt-1">Rekaman audio jernih untuk cloning</span>
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
                    className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-sky-300 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh Video MP4
                  </a>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-full p-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
              Belum ada video presentasi yang dihasilkan. Unggah 3 file media di atas untuk mulai membuat video AI presenter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
