import React from 'react';

export const ImpactStats: React.FC = () => {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 border-b border-[#173A5E] pb-2 mb-4">
        <span className="font-mono text-[#C5432E] font-bold text-sm">05</span>
        <h2 className="font-disp font-bold text-xl uppercase tracking-wide text-[#173A5E]">
          System Impact & Key Operational Metrics
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#173A5E] border border-[#173A5E]">
        <div className="bg-white p-5">
          <b className="block font-disp text-3xl font-bold text-[#173A5E]">15min</b>
          <span className="font-mono text-xs text-[#5B6B7C] uppercase">Deployment Time</span>
        </div>

        <div className="bg-white p-5">
          <b className="block font-disp text-3xl font-bold text-[#173A5E]">94%</b>
          <span className="font-mono text-xs text-[#5B6B7C] uppercase">Damage Classification Target</span>
        </div>

        <div className="bg-white p-5">
          <b className="block font-disp text-3xl font-bold text-[#173A5E]">8×</b>
          <span className="font-mono text-xs text-[#5B6B7C] uppercase">Faster Area Coverage</span>
        </div>

        <div className="bg-white p-5">
          <b className="block font-disp text-3xl font-bold text-[#173A5E]">0</b>
          <span className="font-mono text-xs text-[#5B6B7C] uppercase">First Responder Risk</span>
        </div>
      </div>
    </section>
  );
};
