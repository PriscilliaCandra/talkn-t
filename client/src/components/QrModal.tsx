import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, RefreshCw, CheckCircle2, QrCode } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 transition-all">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-5 space-y-4">
        {/* Header Minimalis */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Hubungkan WhatsApp</h3>
              <p className="text-[10px] text-slate-400">Pindai Kode QR via HP Anda</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
            title="Tutup Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area Compact */}
        <div className="py-2 flex flex-col items-center justify-center text-center">
          {waStatus === 'connected' ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <h4 className="text-base font-bold text-slate-100">WhatsApp Terhubung!</h4>
              <p className="text-xs text-slate-400 max-w-[220px]">
                Sesi WhatsApp aktif & siap membalas obrolan otomatis.
              </p>
            </div>
          ) : qrCodeText ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3.5 bg-white rounded-xl shadow-md border border-slate-200">
                <QRCodeSVG value={qrCodeText} size={180} />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-slate-300 font-medium">
                  Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat
                </p>
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
                  <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                  <span>QR Code diperbarui otomatis</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-xs text-slate-300 font-medium">
                {statusMessage || 'Menyiapkan sesi WhatsApp...'}
              </p>
            </div>
          )}
        </div>

        {/* Footer Minimalis */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
