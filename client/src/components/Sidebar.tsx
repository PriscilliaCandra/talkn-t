import React from 'react';
import { NavLink } from 'react-router-dom';
import { Bot, Video, X } from 'lucide-react';

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
              <div className="w-9 h-9 flex items-center justify-center shrink-0">
                <img
                  src="/logo_icon.png"
                  alt="Talkn't Icon"
                  className="w-full h-full object-contain"
                />
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-white leading-none">
                Talkn't
              </h1>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={onClose}
              className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="p-4 space-y-1">
            {/* Modul 1: ShadowReply */}
            <NavLink
              to="/shadow-reply"
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/20 text-sky-400 border border-blue-500/30 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <Bot className="w-5 h-5 text-sky-400" />
              <div className="flex flex-col">
                <span>ShadowReply</span>
                <span className="text-[10px] text-slate-400">WhatsApp AI Agent</span>
              </div>
            </NavLink>

            {/* Modul 2: StageMate */}
            <NavLink
              to="/stage-mate"
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/20 text-sky-400 border border-blue-500/30 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <Video className="w-5 h-5 text-sky-400" />
              <div className="flex flex-col">
                <span>StageMate</span>
                <span className="text-[10px] text-slate-400">AI Virtual Presenter Generator</span>
              </div>
            </NavLink>
          </nav>
        </div>
      </aside>
    </>
  );
};
