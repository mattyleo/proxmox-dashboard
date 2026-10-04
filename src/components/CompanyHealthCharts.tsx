'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface CompanyHealthItem {
  id: string;
  name: string;
  totalVms: number;
  totalServers: number;
  issuesCount: number;
  criticalCount: number;
  problemPercent: number; // 0% = nessuna problematica, >=10% = problematiche riscontrate
  okPercent: number;      // 100% = tutto ok
  topIssues: string[];
}

const CHART_COLORS = [
  '#f97316', // Orange
  '#10b981', // Emerald
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#14b8a6', // Teal
];

export default function CompanyHealthCharts({
  companies,
}: {
  companies: CompanyHealthItem[];
}) {
  const router = useRouter();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSelectCompany = (id: string, hasIssues: boolean) => {
    router.push(hasIssues ? `/companies/${id}#problematiche` : `/companies/${id}`);
  };

  if (!companies || companies.length === 0) {
    return null;
  }

  // Calcolo angoli per il grafico a Pizza (SVG Pie Chart)
  // Ogni azienda ha una fetta; il colore del bordo/indicatore riflette lo stato di salute
  const totalWeight = companies.length;
  let cumulativeAngle = 0;

  const slices = companies.map((comp, idx) => {
    const sliceAngle = 360 / totalWeight;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + sliceAngle;
    cumulativeAngle = endAngle;

    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;
    const r = 90;
    const cx = 110;
    const cy = 110;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = sliceAngle > 180 ? 1 : 0;

    // Se c'è una sola azienda, disegna un cerchio intero
    const pathData =
      companies.length === 1
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    // Posizione etichetta a metà fetta
    const midRad = (((startAngle + endAngle) / 2 - 90) * Math.PI) / 180;
    const labelX = cx + r * 0.62 * Math.cos(midRad);
    const labelY = cy + r * 0.62 * Math.sin(midRad);

    // Colore in base alle problematiche o palette aziendale
    const statusColor =
      comp.problemPercent >= 25
        ? '#ef4444'
        : comp.problemPercent >= 10
        ? '#f59e0b'
        : CHART_COLORS[idx % CHART_COLORS.length];

    return {
      comp,
      pathData,
      labelX,
      labelY,
      color: statusColor,
      paletteColor: CHART_COLORS[idx % CHART_COLORS.length],
    };
  });

  const hoveredCompany = companies.find((c) => c.id === hoveredId) || companies[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* CHART 1: GRAFICO A PIZZA INTERATTIVO PER AZIENDE */}
      <div className="lg:col-span-5 glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                Vista a Pizza (Cliccabile)
              </span>
              <h3 className="text-lg font-bold">Salute Infrastruttura per Azienda</h3>
            </div>
            <span className="text-xs font-mono bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              {companies.length} {companies.length === 1 ? 'Azienda' : 'Aziende'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Clicca su uno spicchio o sul nome dell&apos;azienda per aprire subito le problematiche rilevate.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 my-auto">
          {/* SVG Pie Chart */}
          <div className="relative flex-shrink-0">
            <svg width="220" height="220" viewBox="0 0 220 220" className="drop-shadow-xl">
              {slices.map(({ comp, pathData, labelX, labelY, color }) => {
                const isHovered = hoveredId === comp.id;
                return (
                  <g
                    key={comp.id}
                    onClick={() => handleSelectCompany(comp.id, comp.problemPercent > 0)}
                    onMouseEnter={() => setHoveredId(comp.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="cursor-pointer transition-transform duration-200"
                    style={{
                      transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                      transformOrigin: '110px 110px',
                    }}
                  >
                    <path
                      d={pathData}
                      fill={color}
                      fillOpacity={isHovered ? 0.95 : 0.8}
                      stroke="#0f1115"
                      strokeWidth="3"
                    />
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="bold"
                      className="pointer-events-none select-none drop-shadow"
                    >
                      {comp.okPercent}% OK
                    </text>
                  </g>
                );
              })}
              {/* Centro Ciambella informativo */}
              <circle cx="110" cy="110" r="36" fill="#0f1115" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
              <text
                x="110"
                y="105"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="13"
                fontWeight="900"
              >
                {hoveredCompany ? `${hoveredCompany.okPercent}%` : '100%'}
              </text>
              <text
                x="110"
                y="120"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="8"
                fontWeight="bold"
              >
                FUNZIONAMENTO
              </text>
            </svg>
          </div>

          {/* Legenda Interattiva Cliccabile */}
          <div className="flex-1 w-full space-y-2 max-h-56 overflow-y-auto pr-1">
            {slices.map(({ comp, color }) => (
              <button
                key={comp.id}
                type="button"
                onClick={() => handleSelectCompany(comp.id, comp.problemPercent > 0)}
                onMouseEnter={() => setHoveredId(comp.id)}
                className="w-full text-left p-2.5 rounded-xl bg-black/30 hover:bg-white/10 border border-white/5 hover:border-primary/40 transition-all flex items-center justify-between gap-2 cursor-pointer group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="truncate">
                    <span className="text-xs font-bold text-white group-hover:text-primary transition-colors block truncate">
                      {comp.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {comp.totalVms} VM • {comp.issuesCount} anomalie
                    </span>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  {comp.problemPercent === 0 ? (
                    <span className="text-[11px] font-mono font-bold text-success bg-success/15 px-2 py-0.5 rounded">
                      100% OK
                    </span>
                  ) : (
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                        comp.problemPercent >= 25
                          ? 'bg-destructive/20 text-destructive'
                          : 'bg-warning/20 text-warning'
                      }`}
                    >
                      ⚠️ {comp.problemPercent}% Prob.
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CHART 2: GRAFICO A RETTANGOLI (TREEMAP / BARRE DI FUNZIONAMENTO E PROBLEMATICHE) */}
      <div className="lg:col-span-7 glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                Mappa a Rettangoli (100% = OK | ≥10% = Problematiche)
              </span>
              <h3 className="text-lg font-bold">Stato Operativo & Problematiche per Azienda</h3>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-success font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm bg-success inline-block" /> 100% OK
              </span>
              <span className="flex items-center gap-1 text-warning font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm bg-warning inline-block" /> ≥10% Problematiche
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Clicca direttamente sul rettangolo di un&apos;azienda per aprire la scheda con il dettaglio dei difetti e come risolverli.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-auto">
          {companies.map((comp) => {
            const isHealthy = comp.problemPercent === 0;
            const isCritical = comp.problemPercent >= 25 || comp.criticalCount > 0;

            return (
              <div
                key={comp.id}
                onClick={() => handleSelectCompany(comp.id, comp.problemPercent > 0)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between ${
                  isHealthy
                    ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400'
                    : isCritical
                    ? 'bg-destructive/10 border-destructive/40 hover:border-destructive'
                    : 'bg-warning/10 border-warning/40 hover:border-warning'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div>
                      <h4 className="font-black text-base text-white group-hover:text-primary transition-colors">
                        🏢 {comp.name}
                      </h4>
                      <span className="text-[11px] text-muted-foreground">
                        {comp.totalServers} Nodi • {comp.totalVms} VM monitorate
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-sm font-mono font-black block ${
                          isHealthy ? 'text-success' : isCritical ? 'text-destructive' : 'text-warning'
                        }`}
                      >
                        {comp.okPercent}% OK
                      </span>
                      {comp.problemPercent > 0 && (
                        <span className="text-[10px] font-mono font-bold text-destructive block">
                          {comp.problemPercent}% Problematiche
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rettangolo / Barra Bicolore Funzionamento vs Problematiche */}
                  <div className="w-full h-3.5 rounded-lg bg-black/40 overflow-hidden flex border border-white/10 my-2.5">
                    <div
                      className="h-full bg-success transition-all"
                      style={{ width: `${comp.okPercent}%` }}
                      title={`Funzionamento regolare: ${comp.okPercent}%`}
                    />
                    {comp.problemPercent > 0 && (
                      <div
                        className={`h-full transition-all ${
                          isCritical ? 'bg-destructive' : 'bg-warning'
                        }`}
                        style={{ width: `${comp.problemPercent}%` }}
                        title={`Problematiche riscontrate: ${comp.problemPercent}%`}
                      />
                    )}
                  </div>

                  {/* Anteprima problematiche */}
                  {comp.topIssues.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {comp.topIssues.slice(0, 2).map((issueTitle, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] text-white/90 bg-black/30 px-2.5 py-1 rounded-md truncate border border-white/5"
                        >
                          ⚠️ {issueTitle}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-success bg-black/20 px-2.5 py-1 rounded-md">
                      ✅ Tutte le VM e i nodi funzionano al 100%
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-white/10 flex justify-between items-center text-[11px]">
                  <span className="text-muted-foreground">
                    {comp.issuesCount === 0
                      ? 'Nessuna anomalia'
                      : `${comp.issuesCount} problematiche attive`}
                  </span>
                  <span className="font-bold text-primary group-hover:translate-x-1 transition-transform">
                    Apri Diagnostica →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
