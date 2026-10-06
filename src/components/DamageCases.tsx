import React from 'react';

const CASES = [
  {
    id: 'TC-01',
    title: 'Earthquake Collapse',
    desc: 'Concrete rubble, dust-obscured visibility, buried test subjects at varying depths.',
    rate: '96%',
  },
  {
    id: 'TC-02',
    title: 'Flood Debris Field',
    desc: 'Waterlogged debris, partial submersion, reduced visual contrast.',
    rate: '91%',
  },
  {
    id: 'TC-03',
    title: 'Post-Fire Structure',
    desc: 'Charred debris, smoke haze, collapsed roofing.',
    rate: '89%',
  },
  {
    id: 'TC-04',
    title: 'Low-Light / Night Search',
    desc: 'Low ambient light, high-ISO equivalent detection pass.',
    rate: '93%',
  },
  {
    id: 'TC-05',
    title: 'Multi-Victim Cluster',
    desc: 'Multiple survivors in close proximity within dense debris.',
    rate: '90%',
  },
  {
    id: 'TC-06',
    title: 'Open Rubble, Daylight',
    desc: 'Baseline case — clear line of sight, standard conditions.',
    rate: '98%',
  },
];

export const DamageCases: React.FC = () => {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 border-b border-[#173A5E] pb-2 mb-4">
        <span className="font-mono text-[#C5432E] font-bold text-sm">04</span>
        <h2 className="font-disp font-bold text-xl uppercase tracking-wide text-[#173A5E]">
          Model Training & Validation Test Scenarios
        </h2>
      </div>

      <p className="text-xs font-mono text-[#5B6B7C] mb-4">
        The detection pipeline is benchmarked against disaster scenarios pairing thermal/RGB imagery against known survivor positions and ground truth.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {CASES.map((c) => (
          <div key={c.id} className="sheet p-4 bg-white border border-[#173A5E]">
            <div className="font-mono text-xs text-[#C5432E] font-bold">{c.id}</div>
            <h3 className="font-disp font-semibold text-base text-[#173A5E] uppercase my-1">
              {c.title}
            </h3>
            <p className="text-xs text-[#5B6B7C] mb-3">{c.desc}</p>
            <div className="border-t border-dashed border-[#173A5E]/20 pt-2 flex items-center justify-between font-mono text-xs">
              <span className="text-[#5B6B7C]">Detection Rate</span>
              <b className="text-[#173A5E] text-sm">{c.rate}</b>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
