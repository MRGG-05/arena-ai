import { useEffect, useMemo, useRef, useState } from 'react';
import { Engine, EngineState } from './lib/engine';
import { STRAINS, milestones, stageAt } from './lib/strains';

const SPEEDS = [1, 2, 4, 8];
const QUALITIES: { label: string; h: number }[] = [
  { label: '1080p', h: 1080 },
  { label: '1440p', h: 1440 },
  { label: '4K UHD', h: 2160 },
];

function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [st, setSt] = useState<EngineState | null>(null);
  const [strainId, setStrainId] = useState(STRAINS[0].id);
  const [quality, setQuality] = useState(2160);

  const strain = useMemo(() => STRAINS.find((s) => s.id === strainId)!, [strainId]);
  const miles = useMemo(() => milestones(strain), [strain]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new Engine(canvas);
    engineRef.current = engine;
    engine.onUpdate = setSt;
    engine.setQuality(2160);
    engine.start();
    const ro = new ResizeObserver(() => engine.applySize());
    ro.observe(canvas);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        engine.setPlaying(!engine.playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      engine.destroy();
    };
  }, []);

  const eng = () => engineRef.current!;
  const day = st?.day ?? 1;
  const stage = stageAt(strain, day);
  const ripeNow = day >= strain.harvestDay - 4;
  const flowering = day >= strain.flowerStart;
  const pct = ((day - 1) / (strain.harvestDay - 1)) * 100;
  const mode = st?.mode ?? 'grow';
  const canMacro = day > strain.flowerStart + 16 && mode === 'grow';

  const trackBg = useMemo(() => {
    const p = (d: number) => (((d - 1) / (strain.harvestDay - 1)) * 100).toFixed(1);
    const fs = strain.flowerStart;
    return `linear-gradient(90deg,#6b5a3a 0%,#8bc34a ${p(5)}%,#4caf50 ${p(22)}%,#2e7d32 ${p(fs)}%,${strain.accent2} ${p(fs + 2)}%,${strain.accent} ${p((fs + strain.harvestDay) / 2)}%,#f0a030 100%)`;
  }, [strain]);

  const ripe = st?.ripe ?? 0;
  const trich = {
    amber: Math.round(Math.max(0, (ripe - 0.72) / 0.28) * 28),
    clear: Math.round(Math.max(0, 1 - ripe * 2.2) * 100),
  };
  const milky = Math.max(0, 100 - trich.amber - trich.clear);

  const selectStrain = (id: string) => {
    setStrainId(id);
    eng().setStrain(id);
  };

  const h = st?.harvest;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white select-none" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)' }} />

      {/* Kopfzeile */}
      <header className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-3 sm:p-5">
        <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: strain.accent, boxShadow: `0 0 12px ${strain.accent}` }} />
            <h1 className="text-sm font-bold tracking-[0.18em] uppercase">GrowCycle 4K</h1>
          </div>
          <p className="mt-0.5 text-[11px] text-white/55">Von Samen bis Ernte · Tag für Tag</p>
        </div>

        <div className="flex gap-2 rounded-2xl border border-white/10 bg-black/40 p-1.5 backdrop-blur-md">
          {STRAINS.map((s) => {
            const active = s.id === strainId;
            return (
              <button
                key={s.id}
                onClick={() => selectStrain(s.id)}
                className={`rounded-xl px-3 py-2 text-left transition ${active ? 'bg-white/15 ring-1 ring-white/30' : 'hover:bg-white/10'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: `linear-gradient(135deg, ${s.accent}, ${s.accent2})` }} />
                  <span className="text-xs font-semibold whitespace-nowrap">{s.name}</span>
                </div>
                <div className="mt-0.5 pl-5 text-[10px] text-white/50">{s.type} · {s.harvestDay} Tage</div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
          <div className="text-right leading-tight">
            <div className="font-mono text-sm font-bold" style={{ color: (st?.fps ?? 60) >= 55 ? '#7CFFA0' : (st?.fps ?? 60) >= 35 ? '#ffd166' : '#ff6b6b' }}>
              {Math.round(st?.fps ?? 60)} FPS
            </div>
            <div className="font-mono text-[10px] text-white/50">{st?.resolution ?? ''}</div>
          </div>
          <select
            value={quality}
            onChange={(e) => {
              const q = Number(e.target.value);
              setQuality(q);
              eng().setQuality(q);
            }}
            className="rounded-lg border border-white/15 bg-black/50 px-2 py-1.5 text-xs outline-none"
          >
            {QUALITIES.map((q) => (
              <option key={q.h} value={q.h}>{q.label}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Info-Karte rechts */}
      {mode !== 'done' && (
        <aside className="absolute top-28 right-3 hidden w-72 space-y-3 sm:right-5 lg:block">
          <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-md">
            <div className="text-[10px] tracking-[0.2em] text-white/50 uppercase">Aktuelle Phase</div>
            <div className="mt-1 text-xl font-bold" style={{ color: strain.accent }}>{stage.name}</div>
            <p className="mt-1 text-xs leading-relaxed text-white/70">{stage.detail}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/5 py-2">
                <div className="text-[10px] text-white/45">Woche</div>
                <div className="font-mono text-sm font-bold">{stage.week}</div>
              </div>
              <div className="rounded-xl bg-white/5 py-2">
                <div className="text-[10px] text-white/45">Höhe</div>
                <div className="font-mono text-sm font-bold">{(st?.height ?? 0).toFixed(0)} cm</div>
              </div>
              <div className="rounded-xl bg-white/5 py-2">
                <div className="text-[10px] text-white/45">Licht</div>
                <div className="font-mono text-[11px] leading-5 font-bold">{stage.light.replace(' Std.', 'h')}</div>
              </div>
            </div>
          </div>

          {flowering && day > strain.flowerStart + 10 && (
            <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-md">
              <div className="text-[10px] tracking-[0.2em] text-white/50 uppercase">Trichome-Reife</div>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-white/10">
                <div style={{ width: `${trich.clear}%`, background: '#bfe9f5' }} />
                <div style={{ width: `${milky}%`, background: '#ffffff' }} />
                <div style={{ width: `${trich.amber}%`, background: '#e8a040' }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-white/60">
                <span>klar {trich.clear}%</span>
                <span>milchig {milky}%</span>
                <span>bernstein {trich.amber}%</span>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">{strain.name}</div>
              <div className="rounded-full px-2 py-0.5 text-[10px] font-bold text-black" style={{ background: strain.accent }}>THC {strain.thc}</div>
            </div>
            <p className="mt-1 text-xs text-white/70">{strain.tagline}</p>
            <p className="mt-2 text-[11px] text-white/50">{strain.colorNote}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {strain.aroma.map((a) => (
                <span key={a} className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/70">{a}</span>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* Schnitt-Hinweis */}
      {mode === 'cut' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/4 flex justify-center">
          <div className="rounded-full border border-white/15 bg-black/50 px-6 py-2.5 text-sm font-semibold backdrop-blur-md">
            {(st?.cutT ?? 0) < 1 ? '✂️ Schnitt am Stängel …' : (st?.cutT ?? 0) < 3.2 ? 'Pflanze wird geerntet …' : 'Trocknen & Curen …'}
          </div>
        </div>
      )}

      {/* Ernte-Ergebnis */}
      {mode === 'done' && h && (
        <div className="absolute top-24 right-3 w-[22rem] max-w-[calc(100vw-1.5rem)] sm:right-8">
          <div className="rounded-3xl border border-white/15 bg-black/55 p-5 shadow-2xl backdrop-blur-xl">
            <div className="text-[10px] tracking-[0.25em] text-white/50 uppercase">Ernte-Ergebnis · Tag {h.day}</div>
            <div className="mt-1 text-2xl font-extrabold" style={{ color: strain.accent }}>{strain.name}</div>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-5xl font-black tabular-nums">{h.grams}</span>
              <span className="pb-1.5 text-lg text-white/60">Gramm</span>
              <span className="ml-auto rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{h.quality}</span>
            </div>
            <p className="mt-2 text-xs text-white/70">{h.note}</p>
            {h.grams > 0 && (
              <>
                <div className="mt-4 text-[10px] tracking-[0.2em] text-white/50 uppercase">Trichome zum Erntezeitpunkt</div>
                <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-white/10">
                  <div style={{ width: `${h.clear}%`, background: '#bfe9f5' }} />
                  <div style={{ width: `${h.milky}%`, background: '#fff' }} />
                  <div style={{ width: `${h.amber}%`, background: '#e8a040' }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-white/60">
                  <span>klar {h.clear}%</span>
                  <span>milchig {h.milky}%</span>
                  <span>bernstein {h.amber}%</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="rounded-xl bg-white/5 py-2"><div className="text-white/45">THC</div><div className="font-bold">{strain.thc}</div></div>
                  <div className="rounded-xl bg-white/5 py-2"><div className="text-white/45">Typ</div><div className="font-bold">{strain.type.split('-')[0]}</div></div>
                  <div className="rounded-xl bg-white/5 py-2"><div className="text-white/45">Reife</div><div className="font-bold">{Math.round(h.ripeness * 100)}%</div></div>
                </div>
              </>
            )}
            <button
              onClick={() => eng().restart()}
              className="mt-5 w-full rounded-xl py-3 text-sm font-bold text-black transition hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${strain.accent}, #ffffff)` }}
            >
              Neue Pflanze starten
            </button>
          </div>
        </div>
      )}

      {/* Steuerung unten */}
      {mode !== 'done' && (
        <footer className="absolute inset-x-0 bottom-0 p-3 sm:p-5">
          <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-black/50 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
            <div className="flex flex-wrap items-center gap-3 sm:gap-5">
              <div className="min-w-[7.5rem]">
                <div className="text-[10px] tracking-[0.25em] text-white/50 uppercase">Tag</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-4xl leading-none font-black tabular-nums">{Math.floor(day)}</span>
                  <span className="font-mono text-xs text-white/45">/ {strain.harvestDay}</span>
                </div>
              </div>

              <button
                onClick={() => eng().setPlaying(!st?.playing)}
                disabled={mode !== 'grow'}
                className="flex h-12 w-12 items-center justify-center rounded-full text-black transition hover:scale-105 disabled:opacity-40"
                style={{ background: strain.accent }}
                title="Abspielen / Pause (Leertaste)"
              >
                {st?.playing ? <Icon d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <Icon d="M7 4l13 8-13 8z" />}
              </button>

              <div className="flex rounded-xl bg-white/5 p-1">
                {SPEEDS.map((v) => (
                  <button
                    key={v}
                    onClick={() => eng().setSpeed(v)}
                    className={`rounded-lg px-2.5 py-1.5 font-mono text-xs transition ${st?.speed === v ? 'bg-white/20 font-bold' : 'text-white/60 hover:bg-white/10'}`}
                    title="Tage pro Sekunde"
                  >
                    {v}×
                  </button>
                ))}
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  onClick={() => eng().setAutoRot(!st?.autoRot)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition ${st?.autoRot ? 'border-white/30 bg-white/15' : 'border-white/10 hover:bg-white/10'}`}
                  title="Pflanze automatisch drehen (oder mit der Maus ziehen)"
                >
                  <Icon d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" className="h-4 w-4" /> Drehen
                </button>
                <button
                  onClick={() => eng().setMacro(!st?.macro)}
                  disabled={!canMacro}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition disabled:opacity-35 ${st?.macro ? 'border-white/30 bg-white/15' : 'border-white/10 hover:bg-white/10'}`}
                  title={canMacro ? 'Makro-Ansicht auf die Haupt-Blüte (Trichome!)' : 'Ab der Blüte verfügbar'}
                >
                  <Icon d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3M11 8v6M8 11h6" className="h-4 w-4" /> Makro
                </button>
                <button
                  onClick={() => eng().restart()}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs transition hover:bg-white/10"
                >
                  <Icon d="M3 12a9 9 0 1 0 3-6.7M3 3v6h6" className="h-4 w-4" /> Neustart
                </button>
                <button
                  onClick={() => eng().doHarvest()}
                  disabled={mode !== 'grow'}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold text-black transition hover:scale-105 disabled:opacity-40 ${ripeNow ? 'animate-pulse' : ''}`}
                  style={{
                    background: ripeNow ? 'linear-gradient(135deg,#ffd166,#ff9f1c)' : 'linear-gradient(135deg,#d9d9d9,#a9a9a9)',
                    boxShadow: ripeNow ? '0 0 28px rgba(255,170,40,0.6)' : 'none',
                  }}
                  title="Pflanze mit einem Klick ernten"
                >
                  <Icon d="M6 9a3 3 0 1 0 0-.01zM6 15a3 3 0 1 0 0-.01zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" className="h-5 w-5" />
                  Ernten
                </button>
              </div>
            </div>

            {/* Zeitleiste */}
            <div className="relative mt-3">
              <div className="h-1.5 rounded-full opacity-90" style={{ background: trackBg }} />
              <input
                type="range"
                min={1}
                max={strain.harvestDay}
                step={0.1}
                value={day}
                disabled={mode !== 'grow'}
                onChange={(e) => {
                  eng().setPlaying(false);
                  eng().setDay(Number(e.target.value));
                }}
                className="timeline absolute inset-x-0 -top-2 h-5 w-full cursor-pointer appearance-none bg-transparent"
                style={{ ['--accent' as string]: strain.accent }}
              />
              <div className="pointer-events-none absolute top-0 left-0 h-1.5 rounded-full bg-white/0" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {miles.map((m) => {
                const active = Math.floor(day) >= m.day;
                return (
                  <button
                    key={m.label}
                    onClick={() => {
                      eng().setPlaying(false);
                      eng().setDay(m.day);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${active ? 'border-white/30 bg-white/12 text-white' : 'border-white/10 text-white/45 hover:bg-white/10'}`}
                  >
                    <span className="font-mono text-white/50">T{m.day}</span> {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
