import React, { useEffect, useState } from 'react';
import { Radio, ShieldAlert, Crosshair } from 'lucide-react';

interface HeaderProps {
  storedCount: number;
  hasGpsFix: boolean;
}

export const Header: React.FC<HeaderProps> = ({ storedCount, hasGpsFix }) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toUTCString().slice(17, 25) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b-2 border-[#173A5E] bg-white sticky top-0 z-30 shadow-sm">
      <div className="max-w-[1140px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-[#173A5E] text-white p-2 rounded-none flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-[#C5432E]" />
          </div>
          <div>
            <div className="font-disp font-bold text-2xl tracking-wider text-[#173A5E] flex items-center gap-2">
              ALPHA <span className="text-[#C5432E]">6</span>
              <span className="text-xs bg-[#173A5E]/10 text-[#173A5E] px-2 py-0.5 font-mono border border-[#173A5E]/20">
                AERIAL SAR
              </span>
            </div>
            <div className="font-mono text-[11px] text-[#5B6B7C] tracking-wide">
              AUTONOMOUS AERIAL DAMAGE ASSESSMENT & SURVIVOR LOCATION SYSTEM
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 bg-[#F4F2EC] px-3 py-1.5 border border-[#173A5E]/30">
            <Radio className="w-3.5 h-3.5 text-[#C5432E] animate-pulse" />
            <span className="text-[#5B6B7C]">LOGGED SURVIVORS:</span>
            <span className="font-bold text-[#173A5E] text-sm">{storedCount}</span>
          </div>

          <div className="flex items-center gap-2 bg-[#F4F2EC] px-3 py-1.5 border border-[#173A5E]/30">
            <Crosshair className={`w-3.5 h-3.5 ${hasGpsFix ? 'text-[#3E7A5C]' : 'text-[#B8862B]'}`} />
            <span className="text-[#5B6B7C]">GPS:</span>
            <span className={`font-semibold ${hasGpsFix ? 'text-[#3E7A5C]' : 'text-[#B8862B]'}`}>
              {hasGpsFix ? 'LOCKED' : 'MANUAL/SEARCH GRID'}
            </span>
          </div>

          <div className="hidden sm:block text-right text-[11px] text-[#5B6B7C]">
            <div>{timeStr}</div>
            <div className="text-[10px] text-[#5B6B7C]/70">SHEET 01/04 · REV D</div>
          </div>
        </div>
      </div>
    </header>
  );
};
