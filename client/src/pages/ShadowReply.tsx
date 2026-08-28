import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { io, Socket } from 'socket.io-client';
import { Bot, ToggleLeft, ToggleRight, Save, Folder, FileText, Sparkles, CheckCircle2, QrCode, MessageSquare, LogOut, Users, User, Phone, ArrowLeft, Upload, Eye, Trash2, Info, Loader2 } from 'lucide-react';

interface ShadowReplyProps {
  waStatus: 'disconnected' | 'connecting' | 'connected';
  onOpenQrModal: () => void;
}

interface MediaFile {
  fileName: string;
  sizeBytes: number;
  updatedAt: number;
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  jid: string;
  senderNumber: string;
  senderName?: string;
  body: string;
  isFromMe: boolean;
  isAi: boolean;
  createdAt: string | number;
}

export const ShadowReply: React.FC<ShadowReplyProps> = ({ waStatus, onOpenQrModal }) => {
  const [autoReply, setAutoReply] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [personaType, setPersonaType] = useState('introvert_casual');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Live Chat Inbox State & Mobile Responsive Navigation
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchMediaFiles();
    fetchMessages();

    const token = localStorage.getItem('talknt_token');
    const socket: Socket = io('http://localhost:5000', {
      auth: { token },
    });

    socket.on('new_message', (newMsg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      setAutoReply(res.data.auto_reply_mode === 'true');
      setSystemPrompt(res.data.system_prompt || '');
      setPersonaType(res.data.active_persona || 'introvert_casual');
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const fetchMediaFiles = async () => {
    try {
      const res = await api.get('/media-assets');
      setMediaFiles(res.data.files || []);
    } catch (err) {
      console.error('Failed to fetch media assets:', err);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await api.get('/chats/messages');
      const fetchedMsgs: ChatMessage[] = res.data.messages || [];
      setMessages(fetchedMsgs);

      if (fetchedMsgs.length > 0 && !selectedJid) {
        setSelectedJid(fetchedMsgs[fetchedMsgs.length - 1].jid);
      }
    } catch (err) {
      console.error('Failed to fetch chat messages:', err);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/settings', { key: 'auto_reply_mode', value: String(autoReply) });
      await api.post('/settings', { key: 'system_prompt', value: systemPrompt });
      await api.post('/settings', { key: 'active_persona', value: personaType });
      showToast('Pengaturan Persona & Auto-Reply berhasil disimpan!');
    } catch (err) {
      showToast('Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadMediaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post('/media-assets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast(`File ${file.name} berhasil diunggah ke ./media_assets`);
      fetchMediaFiles();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Gagal mengunggah file media.');
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const handleDeleteMediaFile = async (fileName: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus file "${fileName}"?`)) return;

    try {
      await api.delete(`/media-assets/${encodeURIComponent(fileName)}`);
      showToast(`File ${fileName} berhasil dihapus.`);
      fetchMediaFiles();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Gagal menghapus file.');
    }
  };

  const handleDisconnectWa = async () => {
    if (!window.confirm('Apakah Anda yakin ingin memutuskan koneksi sesi WhatsApp?')) return;
    setDisconnecting(true);
    try {
      await api.post('/whatsapp/disconnect');
      showToast('Sesi WhatsApp berhasil diputuskan.');
    } catch (err) {
      showToast('Gagal memutuskan WhatsApp.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSelectContact = (jid: string) => {
    setSelectedJid(jid);
    setMobileView('chat');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Grouping Kontak per JID
  const contactsMap = messages.reduce<
    Record<
      string,
      { jid: string; name: string; number: string; isGroup: boolean; lastMsg: string; time: string; timestampNum: number }
    >
  >((acc, m) => {
    const isGroup = m.jid.endsWith('@g.us');
    const timeDate = new Date(m.createdAt);
    const timestampNum = timeDate.getTime();

    acc[m.jid] = {
      jid: m.jid,
      name: m.senderName || m.senderNumber || m.jid,
      number: m.senderNumber || m.jid.split('@')[0],
      isGroup,
      lastMsg: m.body,
      time: timeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestampNum,
    };
    return acc;
  }, {});

  const contacts = Object.values(contactsMap).sort((a, b) => b.timestampNum - a.timestampNum);
  const activeContact = contacts.find((c) => c.jid === selectedJid);
  const activeConversation = messages.filter((m) => m.jid === selectedJid);

  return (
    <div className="space-y-6">
      {/* Top Banner & Status */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-brand-950/40 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2.5 md:p-3 bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-2xl shrink-0">
            <Bot className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-extrabold text-slate-100">Modul 1: ShadowReply</h2>
              <span className="px-2.5 py-0.5 bg-brand-500/10 text-brand-400 border border-brand-500/20 text-[10px] font-bold rounded-full uppercase">
                WhatsApp AI Agent & Live Chat
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Kelola balasan otomatis DeepSeek AI, Live Chat Inbox & sesi WhatsApp secara real-time
            </p>
          </div>
        </div>

        {/* Status Connection & Action Button */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {waStatus === 'connected' ? (
            <button
              onClick={handleDisconnectWa}
              disabled={disconnecting}
              className="w-full md:w-auto px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 text-xs font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              {disconnecting ? 'Memutuskan...' : 'Putuskan WhatsApp'}
            </button>
          ) : (
            <button
              onClick={onOpenQrModal}
              className="w-full md:w-auto px-4 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <QrCode className="w-4 h-4" />
              Hubungkan WhatsApp
            </button>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* --- FITUR REAL-TIME LIVE CHAT INBOX (FULLY RESPONSIVE ALL DEVICES) --- */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm md:text-base font-bold text-slate-100 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-400 shrink-0" />
            Live Chat Inbox WhatsApp
          </h3>
          <span className="text-xs text-emerald-400 font-medium animate-pulse flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Socket.io Live Stream
          </span>
        </div>

        <div className="h-[460px] md:h-[500px] bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-inner flex relative">
          
          {/* KOLOM 1: DAFTAR KONTAK */}
          <div
            className={`w-full md:w-[35%] xl:w-[30%] border-r border-slate-800 flex flex-col bg-slate-950/80 transition-all ${
              mobileView === 'chat' ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="px-3 py-2.5 border-b border-slate-800/80 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex justify-between items-center shrink-0">
              <span>Daftar Obrolan</span>
              <span className="px-2 py-0.5 bg-slate-800 rounded-full text-slate-400 font-mono text-[10px]">{contacts.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {contacts.length > 0 ? (
                contacts.map((c) => (
                  <button
                    key={c.jid}
                    onClick={() => handleSelectContact(c.jid)}
                    className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${
                      selectedJid === c.jid
                        ? 'bg-brand-600/20 border border-brand-500/30 text-slate-100 shadow-md'
                        : 'hover:bg-slate-900/80 text-slate-400'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full font-bold flex items-center justify-center shrink-0 shadow-sm text-sm ${
                        c.isGroup
                          ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/30'
                          : 'bg-brand-600/30 text-brand-400 border border-brand-500/30'
                      }`}
                    >
                      {c.isGroup ? <Users className="w-5 h-5" /> : c.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-100 truncate">{c.name}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">{c.time}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-semibold shrink-0 ${
                            c.isGroup ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {c.isGroup ? 'Group' : 'Personal'}
                        </span>
                        <p className="text-[11px] text-slate-400 truncate flex-1">{c.lastMsg}</p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-500">
                  Belum ada percakapan masuk. Hubungkan WhatsApp untuk menyinkronkan chat.
                </div>
              )}
            </div>
          </div>

          {/* KOLOM 2: AREA PERCAKAPAN (CHAT BUBBLES) */}
          <div
            className={`flex-1 flex flex-col justify-between bg-slate-950/40 w-full transition-all ${
              mobileView === 'list' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {activeContact ? (
              <>
                <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setMobileView('list')}
                      className="md:hidden p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Kembali</span>
                    </button>

                    <div
                      className={`w-9 h-9 rounded-full font-bold flex items-center justify-center text-sm ${
                        activeContact.isGroup ? 'bg-indigo-600/30 text-indigo-400' : 'bg-brand-600/30 text-brand-400'
                      }`}
                    >
                      {activeContact.isGroup ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">{activeContact.name}</h4>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-500" /> {activeContact.number}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  {activeConversation.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.isFromMe ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] md:max-w-md px-4 py-2.5 rounded-2xl text-xs shadow-md ${
                          msg.isFromMe
                            ? msg.isAi
                              ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-br-none'
                              : 'bg-indigo-600 text-white rounded-br-none'
                            : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700'
                        }`}
                      >
                        {msg.isAi && (
                          <span className="block text-[9px] font-extrabold uppercase text-brand-200 mb-1 tracking-wider">
                            🤖 AI Auto-Reply (Talkn't)
                          </span>
                        )}
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1 px-1">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs p-6 text-center">
                <MessageSquare className="w-10 h-10 text-slate-700 mb-2" />
                Pilih obrolan dari daftar kontak untuk melihat balasan real-time.
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Grid Settings & Media */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Control Panel Settings (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-lg space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h3 className="text-sm md:text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-400" />
              Control Panel Persona & Auto-Reply
            </h3>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
              <div>
                <h4 className="text-xs md:text-sm font-semibold text-slate-200">Mode Auto-Reply WhatsApp</h4>
                <p className="text-[11px] md:text-xs text-slate-400">
                  Aktifkan agar AI membalas obrolan WhatsApp secara otomatis
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoReply(!autoReply)}
                className="text-brand-400 hover:text-brand-300 transition-colors shrink-0"
              >
                {autoReply ? (
                  <ToggleRight className="w-9 h-9 md:w-10 md:h-10 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-9 h-9 md:w-10 md:h-10 text-slate-600" />
                )}
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                Preset Gaya Bahasa (Persona)
              </label>
              <select
                value={personaType}
                onChange={(e) => setPersonaType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-brand-500 rounded-xl p-3 text-xs md:text-sm text-slate-200 outline-none"
              >
                <option value="introvert_casual">Introvert Casual (Santai, Ringkas, Luwes, Rendah Hati)</option>
                <option value="extrovert_expressive">Extrovert Expressive (Antusias, Ramah, Menggunakan Emoticon)</option>
                <option value="executive_professional">Executive Professional (Baku, Singkat, Efisien)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                System Prompt Persona
              </label>
              <textarea
                rows={4}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Tuliskan instruksi persona AI di sini..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-brand-500 rounded-xl p-4 text-xs md:text-sm text-slate-200 placeholder-slate-600 outline-none resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs md:text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>

        {/* Media Assets Browser (1 col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div>
                <h3 className="text-sm md:text-base font-bold text-slate-100 flex items-center gap-2">
                  <Folder className="w-5 h-5 text-indigo-400 shrink-0" />
                  Daftar Media Lokal
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">./media_assets</p>
              </div>

              {/* Upload Media Button */}
              <label className="cursor-pointer px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors">
                {uploadingMedia ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>Tambah File</span>
                <input
                  type="file"
                  onChange={handleUploadMediaFile}
                  disabled={uploadingMedia}
                  className="hidden"
                />
              </label>
            </div>

            {/* Explanation Note Banner */}
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-[11px] text-indigo-300 space-y-1 mb-3">
              <div className="flex items-center gap-1.5 font-bold">
                <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Fungsi AI Tool Calling Media:</span>
              </div>
              <p className="text-slate-300 leading-normal">
                File di folder ini digunakan oleh AI Agent (DeepSeek) untuk **dikirimkan otomatis via WhatsApp** ketika pelanggan/kontak meminta brosur, katalog, dokumen, atau gambar di chat.
              </p>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {mediaFiles.length > 0 ? (
                mediaFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <FileText className="w-5 h-5 text-brand-400 shrink-0" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-semibold text-slate-200 truncate">{file.fileName}</span>
                        <span className="text-[10px] text-slate-500">
                          {(file.sizeBytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons: Preview & Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      {file.previewUrl && (
                        <a
                          href={`http://localhost:5000${file.previewUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded-lg transition-colors"
                          title="Preview File"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteMediaFile(file.fileName)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors"
                        title="Hapus File"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  Belum ada file di folder ./media_assets. Klik "Tambah File" di atas untuk mengunggah dokumen/brosur.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
