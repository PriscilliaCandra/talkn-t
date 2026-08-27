import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, QrCode, RefreshCw, CheckCircle } from 'lucide-react';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrCodeText: string;
  waStatus: 'disconnected' | 'connecting' | 'connected';
  statusMessage?: string;
}

export const QrModal: React.FC<QrModalProps> = ({
  isOpen,
  onClose,
  qrCodeText,
  waStatus,
  statusMessage,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Hubungkan WhatsApp</h3>
              <p className="text-xs text-slate-400">Pindai QR Code via aplikasi WhatsApp</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-6 flex flex-col items-center justify-center text-center">
          {waStatus === 'connected' ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="w-16 h-16 text-emerald-500 animate-bounce" />
              <h4 className="text-xl font-bold text-emerald-400">WhatsApp Terhubung!</h4>
              <p className="text-sm text-slate-300">Agent Talkn't (ShadowReply) siap digunakan.</p>
            </div>
          ) : qrCodeText ? (
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-white rounded-xl shadow-lg border border-slate-200">
                <QRCodeSVG value={qrCodeText} size={220} />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-500" />
                <span>QR Code diperbarui secara real-time via Socket.io</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8">
              <RefreshCw className="w-12 h-12 text-brand-500 animate-spin" />
              <p className="text-sm text-slate-300 font-medium">
                {statusMessage || 'Menyiapkan sesi WhatsApp...'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
