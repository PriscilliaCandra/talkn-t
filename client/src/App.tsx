import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { QrModal } from './components/QrModal';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ShadowReply } from './pages/ShadowReply';
import { StageMate } from './pages/StageMate';

const ProtectedLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [waStatus, setWaStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [waMessage, setWaMessage] = useState('');
  const [qrCodeText, setQrCodeText] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const socket: Socket = io('http://localhost:5000');

    socket.on('wa_status_update', (data: { status: 'disconnected' | 'connecting' | 'connected'; message?: string; qrCode?: string }) => {
      setWaStatus(data.status);
      if (data.message) setWaMessage(data.message);
      if (data.qrCode) setQrCodeText(data.qrCode);
    });

    socket.on('wa_qr_code', (data: { qrCode: string }) => {
      setQrCodeText(data.qrCode);
      setIsQrModalOpen(true);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Memuat data autentikasi Talkn't...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          waStatus={waStatus}
          onOpenQrModal={() => setIsQrModalOpen(true)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />
        <main className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/shadow-reply" replace />} />
            <Route
              path="/shadow-reply"
              element={
                <ShadowReply waStatus={waStatus} onOpenQrModal={() => setIsQrModalOpen(true)} />
              }
            />
            <Route path="/stage-mate" element={<StageMate />} />
          </Routes>
        </main>
      </div>

      <QrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        qrCodeText={qrCodeText}
        waStatus={waStatus}
        statusMessage={waMessage}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
