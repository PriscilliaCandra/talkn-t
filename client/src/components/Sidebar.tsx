import React from 'react';
import { NavLink } from 'react-router-dom';
import { Bot, Video, ShieldAlert, X } from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="md:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 md:z-30 w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 h-screen transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div>
          {/* Brand & Official Transparent Talkn't Symbol */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                <img
                  src="/logo_icon.png"
                  alt="Talkn't Icon"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-white leading-none">
                  Talkn't
                </h1>
                <p className="text-[9px] uppercase font-bold text-brand-400 tracking-wider mt-1">
                  AI Co-Pilot Suite
                </p>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={onClose}
              className="md:hidden p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="p-4 space-y-1">
            <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Modul Utama
            </div>

            {/* Modul 1: ShadowReply */}
            <NavLink
              to="/shadow-reply"
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`
              }
            >
              <Bot className="w-5 h-5" />
              <div className="flex flex-col">
                <span>ShadowReply</span>
                <span className="text-[10px] text-slate-500">WhatsApp AI Agent</span>
              </div>
            </NavLink>

            {/* Modul 2: StageMate */}
            <NavLink
              to="/stage-mate"
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`
              }
            >
              <Video className="w-5 h-5" />
              <div className="flex flex-col">
                <span>StageMate</span>
                <span className="text-[10px] text-slate-500">AI Virtual Presenter Generator</span>
              </div>
            </NavLink>
          </nav>
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-slate-800">
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center gap-3 text-xs text-slate-400">
            <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>DeepSeek API Active</span>
          </div>
        </div>
      </aside>
    </>
  );
};
