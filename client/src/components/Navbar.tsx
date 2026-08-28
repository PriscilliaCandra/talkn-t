import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { LogOut, Wifi, WifiOff, LogOut as DisconnectIcon, Menu } from 'lucide-react';

interface NavbarProps {
  waStatus: 'disconnected' | 'connecting' | 'connected';
  onOpenQrModal: () => void;
  onToggleMobileSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ waStatus, onOpenQrModal, onToggleMobileSidebar }) => {
  const { user, logout } = useAuth();
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnectWa = async () => {
    if (!window.confirm('Apakah Anda yakin ingin memutuskan koneksi sesi WhatsApp?')) return;
    setDisconnecting(true);
    try {
      await api.post('/whatsapp/disconnect');
    } catch (err) {
      console.error('Failed to disconnect WA:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 md:px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left: Mobile Hamburger & WhatsApp Status Widget */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Mobile Hamburger Toggle Button */}
        <button
          onClick={onToggleMobileSidebar}
          className="md:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          title="Buka Menu Sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* WhatsApp Status Badge - Strict Blue/Navy/White Theme */}
        <div className="flex items-center gap-2 px-2.5 md:px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-[11px] md:text-xs">
          {waStatus === 'connected' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <Wifi className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-sky-400 font-medium hidden xs:inline">WhatsApp Connected</span>
              <span className="text-sky-400 font-medium xs:hidden">Connected</span>
            </>
          ) : waStatus === 'connecting' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <span className="text-sky-300 font-medium">Connecting...</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-600" />
              <WifiOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-slate-400 font-medium hidden xs:inline">WhatsApp Disconnected</span>
              <span className="text-slate-400 font-medium xs:hidden">Disconnected</span>
            </>
          )}
        </div>

        {waStatus === 'connected' ? (
          <button
            onClick={handleDisconnectWa}
            disabled={disconnecting}
            className="px-2.5 md:px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 text-[11px] md:text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <DisconnectIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{disconnecting ? 'Memutuskan...' : 'Putuskan WA'}</span>
          </button>
        ) : (
          <button
            onClick={onOpenQrModal}
            className="px-2.5 md:px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] md:text-xs font-semibold rounded-lg shadow-md transition-all active:scale-95 whitespace-nowrap"
          >
            Hubungkan WA
          </button>
        )}
      </div>

      {/* Right: User Profile & Logout */}
      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white font-bold shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="hidden lg:flex flex-col">
                <span className="font-semibold text-white leading-tight">{user.name}</span>
                <span className="text-[10px] text-slate-400">{user.email}</span>
              </div>
            </div>

            <button
              onClick={logout}
              title="Logout"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
