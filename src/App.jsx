import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── Route stations (Northern Line) ──────────────────────────────────────────
const STATIONS = [
  { name: "Chiang Mai",    km: 0,   lat: 18.797, lng: 98.971,  dep: "17:45", type: "major" },
  { name: "Lamphun",       km: 26,  lat: 18.574, lng: 99.020,  dep: "18:20", type: "minor" },
  { name: "Lampang",       km: 132, lat: 18.288, lng: 99.492,  dep: "19:45", type: "major" },
  { name: "Den Chai",      km: 238, lat: 17.977, lng: 100.039, dep: "21:10", type: "major" },
  { name: "Uttaradit",     km: 301, lat: 17.625, lng: 100.096, dep: "22:05", type: "major" },
  { name: "Sila At",       km: 359, lat: 17.285, lng: 100.049, dep: "23:00", type: "depot" },
  { name: "Phitsanulok",   km: 388, lat: 16.823, lng: 100.265, dep: "23:40", type: "major" },
  { name: "Phichit",       km: 450, lat: 16.443, lng: 100.349, dep: "00:35", type: "major" },
  { name: "Nakhon Sawan",  km: 533, lat: 15.703, lng: 100.137, dep: "01:45", type: "major" },
  { name: "Lop Buri 2",    km: 617, lat: 14.985, lng: 100.672, dep: "03:05", type: "minor", note: "Bypass stn Dec 2025" },
  { name: "Ayutthaya",     km: 671, lat: 14.356, lng: 100.585, dep: "04:05", type: "major" },
  { name: "Don Muang",     km: 726, lat: 13.928, lng: 100.601, dep: "05:10", type: "major" },
  { name: "Bangkok (KTW)", km: 751, lat: 13.804, lng: 100.543, dep: "07:00", type: "terminus" },
];

const TOTAL_KM = 751;
const TRAIN_KMH = 65;

const DEAD_ZONES = [
  { start: 140, end: 175, name: "Doi Khun Tan Tunnel",                      severity: "complete" },
  { start: 175, end: 230, name: "Highland jungle (Doi Khun Tan–Den Chai)",   severity: "weak"     },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function latLngToRouteKm(lat, lng) {
  let bestKm = 0, bestDist = Infinity;
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const A = STATIONS[i], B = STATIONS[i + 1];
    const dx = B.lat - A.lat, dy = B.lng - A.lng;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((lat - A.lat) * dx + (lng - A.lng) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const dist = Math.hypot(lat - (A.lat + t * dx), lng - (A.lng + t * dy));
    if (dist < bestDist) { bestDist = dist; bestKm = A.km + t * (B.km - A.km); }
  }
  return Math.round(bestKm);
}

function kmToLocationName(km) {
  for (let i = STATIONS.length - 1; i >= 0; i--) {
    if (km >= STATIONS[i].km) {
      const next = STATIONS[i + 1];
      if (!next) return STATIONS[i].name;
      const pct = Math.round(((km - STATIONS[i].km) / (next.km - STATIONS[i].km)) * 100);
      if (pct < 10) return `near ${STATIONS[i].name}`;
      if (pct > 90) return `near ${next.name}`;
      return `between ${STATIONS[i].name} & ${next.name}`;
    }
  }
  return "Unknown";
}

// ── Tower generation ─────────────────────────────────────────────────────────
function generateTowers() {
  const towers = [];
  let id = 0;
  const rng = (() => { let s = 42; return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }; })();
  const carriers = [
    { name: "AIS",  color: "#e04040", band: "4G/5G" },
    { name: "True", color: "#f59e0b", band: "4G"    },
    { name: "DTAC", color: "#3b82f6", band: "4G"    },
    { name: "TOT",  color: "#10b981", band: "3G/4G" },
  ];
  STATIONS.forEach((stn, si) => {
    const nextKm = si < STATIONS.length - 1 ? STATIONS[si + 1].km : TOTAL_KM;
    const density = stn.type === "major" ? 18 : stn.type === "terminus" ? 24 : stn.type === "depot" ? 8 : 6;
    for (let i = 0; i < density; i++) {
      const km = Math.max(0, Math.min(TOTAL_KM, stn.km + (rng() - 0.5) * 14));
      carriers.forEach(c => { if (rng() > 0.35) towers.push({ id: id++, km, carrier: c.name, color: c.color, band: c.band, signal: Math.floor(rng() * 3) + 2, lat: stn.lat + (rng() - 0.5) * 0.12, lng: stn.lng + (rng() - 0.5) * 0.12 }); });
    }
    const isMountain = stn.km >= 100 && stn.km < 300;
    for (let j = 0; j < (isMountain ? 3 : 8); j++) {
      const km = stn.km + rng() * (nextKm - stn.km);
      if (rng() > 0.5) { const c = carriers[Math.floor(rng() * carriers.length)]; towers.push({ id: id++, km, carrier: c.name, color: c.color, band: c.band, signal: isMountain ? 1 : Math.floor(rng() * 2) + 2, lat: stn.lat + (rng() - 0.5) * 0.3, lng: stn.lng + (rng() - 0.5) * 0.3 }); }
    }
  });
  towers.sort((a, b) => a.km - b.km);
  return towers;
}

const ALL_TOWERS = generateTowers();
const CARRIERS = ["AIS", "True", "DTAC", "TOT"];
const CARRIER_COLORS = { AIS: "#e04040", True: "#f59e0b", DTAC: "#3b82f6", TOT: "#10b981" };

function getSignalAt(km, carrier) {
  const nearby = ALL_TOWERS.filter(t => t.carrier === carrier && Math.abs(t.km - km) < 25);
  if (!nearby.length) return 0;
  let score = 0;
  nearby.forEach(t => { score += t.signal * Math.max(0, 1 - Math.abs(t.km - km) / 25); });
  return Math.min(4, Math.round(score * 0.55));
}

function getTerrainColor(km) {
  if (km < 140) return "#2d4a3e";
  if (km < 300) return "#3a3a2a";
  if (km < 500) return "#1e3a2e";
  if (km < 650) return "#2a2a1a";
  return "#1a1a2e";
}
function signalColor(b) { return b <= 1 ? "#dc2626" : b === 2 ? "#f59e0b" : b === 3 ? "#22c55e" : "#10b981"; }
function signalLabel(b) { return ["No Signal", "Weak", "Fair", "Good", "Strong"][b] || "—"; }

function getNextDeadZone(km, kmh) {
  for (const dz of DEAD_ZONES) {
    if (dz.start > km) {
      const kmAway = dz.start - km;
      return { ...dz, kmAway: Math.round(kmAway), minsAway: Math.round((kmAway / kmh) * 60), duration: Math.round(((dz.end - dz.start) / kmh) * 60) };
    }
  }
  return null;
}
function getSignalRecovery(km, kmh) {
  const dz = DEAD_ZONES.find(d => km >= d.start && km <= d.end);
  if (!dz) return null;
  const kmAway = dz.end - km;
  return { km: dz.end, minsAway: Math.round((kmAway / kmh) * 60), kmAway: Math.round(kmAway) };
}

// Wind Beaufort description
function beaufortDesc(kmh) {
  if (kmh < 1)  return "Calm";
  if (kmh < 6)  return "Light air";
  if (kmh < 12) return "Light breeze";
  if (kmh < 20) return "Gentle breeze";
  if (kmh < 29) return "Moderate breeze";
  if (kmh < 39) return "Fresh breeze";
  if (kmh < 50) return "Strong breeze";
  if (kmh < 62) return "Near gale";
  return "Gale+";
}
function windDirLabel(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}
function weatherCodeIcon(code) {
  if (code === 0) return "☀️";
  if (code <= 2)  return "🌤️";
  if (code <= 3)  return "☁️";
  if (code <= 49) return "🌫️";
  if (code <= 69) return "🌧️";
  if (code <= 79) return "🌨️";
  if (code <= 82) return "🌦️";
  if (code <= 99) return "⛈️";
  return "🌡️";
}

// ── UI Components ─────────────────────────────────────────────────────────────
function PhoneSignal({ bars, carrier, band, size = "md", showLabel = true }) {
  const color = signalColor(bars);
  const barW = size === "xl" ? 10 : size === "lg" ? 7 : 5;
  const gap  = size === "xl" ? 4  : size === "lg" ? 3 : 2;
  const maxH = size === "xl" ? 40 : size === "lg" ? 28 : 20;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap, height: maxH }}>
        {[1, 2, 3, 4].map(b => (
          <div key={b} style={{ width: barW, height: (b / 4) * maxH, borderRadius: 2, background: b <= bars ? color : "#1f2937", border: `1px solid ${b <= bars ? color : "#374151"}`, transition: "background 0.5s,border-color 0.5s", boxShadow: b <= bars ? `0 0 6px ${color}66` : "none" }} />
        ))}
      </div>
      {showLabel && size === "lg" && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "monospace" }}>{carrier}</div>
          <div style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>{band}</div>
          <div style={{ fontSize: 9, color, fontFamily: "monospace", fontWeight: 600 }}>{signalLabel(bars)}</div>
        </>
      )}
    </div>
  );
}

function SignalForecast({ currentKm, carrier }) {
  const steps = 80, AHEAD = 80;
  const bars = Array.from({ length: steps }, (_, i) => {
    const km = currentKm + (i / steps) * AHEAD;
    return km > TOTAL_KM ? -1 : getSignalAt(km, carrier);
  });
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 28, width: "100%" }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, height: b < 0 ? 0 : b === 0 ? 3 : (b / 4) * 28, background: b < 0 ? "transparent" : signalColor(b), borderRadius: 1, opacity: 0.6 + (i / steps) * 0.4 }} />
      ))}
    </div>
  );
}

// ── Track-ahead Mini Map ──────────────────────────────────────────────────────
// Shows the next ~200 km of route as a curved SVG path with stations, dead zones, signal colour
function TrackAheadMap({ currentKm, userKm }) {
  const W = 700, H = 200;
  const AHEAD = 200; // km window ahead
  const startKm = currentKm;
  const endKm   = Math.min(TOTAL_KM, currentKm + AHEAD);

  // Convert km on route to (lat, lng) by interpolating between station waypoints
  function kmToLatLng(km) {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const A = STATIONS[i], B = STATIONS[i + 1];
      if (km >= A.km && km <= B.km) {
        const t = (km - A.km) / (B.km - A.km);
        return { lat: A.lat + t * (B.lat - A.lat), lng: A.lng + t * (B.lng - A.lng) };
      }
    }
    return { lat: STATIONS[STATIONS.length - 1].lat, lng: STATIONS[STATIONS.length - 1].lng };
  }

  // Collect route points every 5 km ahead
  const routePoints = [];
  for (let km = startKm; km <= endKm + 5; km += 5) {
    const { lat, lng } = kmToLatLng(Math.min(km, TOTAL_KM));
    routePoints.push({ km: Math.min(km, TOTAL_KM), lat, lng });
  }

  // Determine bounding box
  const lats = routePoints.map(p => p.lat);
  const lngs = routePoints.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const PAD = 18;

  function project(lat, lng) {
    const latRange = maxLat - minLat || 0.01;
    const lngRange = maxLng - minLng || 0.01;
    // preserve aspect ratio
    const scaleX = (W - PAD * 2) / lngRange;
    const scaleY = (H - PAD * 2) / latRange;
    const scale  = Math.min(scaleX, scaleY);
    const offX = (W - lngRange * scale) / 2;
    const offY = (H - latRange * scale) / 2;
    return {
      x: offX + (lng - minLng) * scale,
      y: offY + (maxLat - lat) * scale,   // flip y: north = top
    };
  }

  // Build path string
  const pts = routePoints.map(p => project(p.lat, p.lng));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Coloured segments by signal strength (every 5 km, best carrier)
  const segments = routePoints.slice(0, -1).map((p, i) => {
    const midKm  = (p.km + routePoints[i + 1].km) / 2;
    const sig    = Math.max(...CARRIERS.map(c => getSignalAt(midKm, c)));
    const inDead = DEAD_ZONES.some(dz => midKm >= dz.start && midKm <= dz.end);
    const color  = inDead ? "#dc2626" : signalColor(sig);
    const p1     = pts[i], p2 = pts[i + 1];
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, color, km: p.km };
  });

  // Stations within window
  const visibleStns = STATIONS.filter(s => s.km >= startKm && s.km <= endKm);

  // Your position dot
  const youPt = userKm != null ? project(kmToLatLng(userKm).lat, kmToLatLng(userKm).lng) : null;

  // Current front-of-train dot
  const trainPt = project(kmToLatLng(currentKm).lat, kmToLatLng(currentKm).lng);

  return (
    <div style={{ background: "#0a0e1a", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ background: "#111827", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1f2937" }}>
        <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: 2, textTransform: "uppercase" }}>🗺️ Track ahead — next {Math.round(endKm - startKm)} km</span>
        <span style={{ fontSize: 10, color: "#6b7280" }}>KM {Math.round(startKm)} → KM {Math.round(endKm)}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Background */}
        <rect width={W} height={H} fill="#0a0e1a" />

        {/* Grid lines faint */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={0} y1={H * f} x2={W} y2={H * f} stroke="#1f2937" strokeWidth={0.5} />
        ))}

        {/* Dead zone shading on map */}
        {DEAD_ZONES.map(dz => {
          const dzPts = [];
          for (let km = Math.max(startKm, dz.start); km <= Math.min(endKm, dz.end); km += 2) {
            dzPts.push(project(kmToLatLng(km).lat, kmToLatLng(km).lng));
          }
          if (!dzPts.length) return null;
          return dzPts.map((p, i) => (
            <circle key={`${dz.name}-${i}`} cx={p.x} cy={p.y} r={6}
              fill={dz.severity === "complete" ? "#dc262633" : "#f59e0b22"} />
          ));
        })}

        {/* Coloured route segments */}
        {segments.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={s.color} strokeWidth={4} strokeLinecap="round" opacity={0.9} />
        ))}

        {/* Stations */}
        {visibleStns.map(stn => {
          const p = project(stn.lat, stn.lng);
          const isMajor = stn.type === "major" || stn.type === "terminus";
          const sig = Math.max(...CARRIERS.map(c => getSignalAt(stn.km, c)));
          return (
            <g key={stn.name}>
              {isMajor && <circle cx={p.x} cy={p.y} r={9} fill="#0f172a" stroke={signalColor(sig)} strokeWidth={1.5} opacity={0.7} />}
              <circle cx={p.x} cy={p.y} r={isMajor ? 5 : 3}
                fill={stn.type === "terminus" ? "#10b981" : isMajor ? "#3b82f6" : "#6b7280"} />
              {isMajor && (
                <text x={p.x} y={p.y - 13} textAnchor="middle" fontSize={8}
                  fill="#94a3b8" fontFamily="monospace" fontWeight="600">
                  {stn.name.split(" ")[0]}
                </text>
              )}
              {isMajor && (
                <text x={p.x} y={p.y + 18} textAnchor="middle" fontSize={7} fill="#4b5563" fontFamily="monospace">
                  {stn.dep}
                </text>
              )}
            </g>
          );
        })}

        {/* Dead zone label */}
        {DEAD_ZONES.filter(dz => dz.start >= startKm && dz.start <= endKm).map(dz => {
          const p = project(kmToLatLng(dz.start).lat, kmToLatLng(dz.start).lng);
          return (
            <g key={dz.name}>
              <text x={p.x + 8} y={p.y - 4} fontSize={7} fill="#dc2626" fontFamily="monospace">
                {dz.severity === "complete" ? "📵 NO SIGNAL" : "⚠️ WEAK"}
              </text>
            </g>
          );
        })}

        {/* YOU pin */}
        {youPt && (
          <g>
            <circle cx={youPt.x} cy={youPt.y} r={10} fill="#3b82f622" stroke="#3b82f6" strokeWidth={1.5} />
            <circle cx={youPt.x} cy={youPt.y} r={4} fill="#3b82f6" />
            <text x={youPt.x} y={youPt.y - 14} textAnchor="middle" fontSize={8} fill="#93c5fd" fontFamily="monospace" fontWeight="700">YOU</text>
          </g>
        )}

        {/* Train front arrow */}
        <g transform={`translate(${trainPt.x},${trainPt.y})`}>
          <circle cx={0} cy={0} r={7} fill="#f59e0b" opacity={0.9} />
          <polygon points="0,-5 -3,2 3,2" fill="#0a0e1a" />
        </g>

        {/* Legend */}
        {[
          { color: "#10b981", label: "Strong" },
          { color: "#22c55e", label: "Good"   },
          { color: "#f59e0b", label: "Fair"   },
          { color: "#dc2626", label: "Weak/None" },
        ].map((l, i) => (
          <g key={l.label} transform={`translate(${W - 90},${12 + i * 14})`}>
            <rect x={0} y={0} width={10} height={5} rx={2} fill={l.color} opacity={0.8} />
            <text x={14} y={6} fontSize={7} fill="#6b7280" fontFamily="monospace">{l.label}</text>
          </g>
        ))}

        {/* North arrow */}
        <g transform={`translate(${W - 18}, 90)`}>
          <text x={0} y={0} textAnchor="middle" fontSize={8} fill="#4b5563" fontFamily="monospace">N</text>
          <line x1={0} y1={3} x2={0} y2={12} stroke="#4b5563" strokeWidth={1} />
          <polygon points="0,2 -2,7 2,7" fill="#4b5563" />
        </g>
      </svg>

      {/* Signal legend bar */}
      <div style={{ padding: "6px 14px", background: "#0d1117", borderTop: "1px solid #1f2937", display: "flex", gap: 16, fontSize: 9, color: "#6b7280", alignItems: "center" }}>
        <span>🟡 Train position</span>
        <span>🔵 Your GPS</span>
        <span>Line colour = best signal at that point</span>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [gps, setGps]           = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("waiting");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [weather, setWeather]   = useState(null);  // Open-Meteo response
  const [weatherLoading, setWeatherLoading] = useState(false);
  const watchRef    = useRef(null);
  const forcePollRef = useRef(null);
  const weatherRef  = useRef(null); // debounce

  const userKm       = useMemo(() => gps ? latLngToRouteKm(gps.lat, gps.lng) : null, [gps]);
  const locationName = useMemo(() => userKm != null ? kmToLocationName(userKm) : null, [userKm]);

  const [progress, setProgress]   = useState(0);
  const [manualMode, setManualMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCarriers, setActiveCarriers] = useState(new Set(CARRIERS));
  const [hoveredTower, setHoveredTower] = useState(null);
  const [speed, setSpeed]         = useState(1);
  const rafRef      = useRef(null);
  const lastTimeRef = useRef(null);

  useEffect(() => {
    if (userKm != null && !manualMode) setProgress(userKm / TOTAL_KM);
  }, [userKm, manualMode]);

  // ── GPS watch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus("error"); setGpsError("Geolocation not supported"); return; }
    const onSuccess = (pos) => {
      const { latitude: lat, longitude: lng, accuracy, speed: spd, heading: hdg, altitude: alt } = pos.coords;
      setGps({ lat, lng, accuracy: Math.round(accuracy), speedMs: spd, speedKmh: spd != null ? spd * 3.6 : null, heading: hdg, altitude: alt != null ? Math.round(alt) : null });
      setGpsStatus("tracking");
      setGpsError(null);
      setLastUpdate(new Date());
    };
    const onError = (err) => { setGpsStatus("error"); setGpsError(err.message); };
    const opts = { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 };
    watchRef.current = navigator.geolocation.watchPosition(onSuccess, onError, opts);
    forcePollRef.current = setInterval(() => navigator.geolocation.getCurrentPosition(onSuccess, onError, { ...opts, maximumAge: 0 }), 60000);
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); if (forcePollRef.current) clearInterval(forcePollRef.current); };
  }, []);

  // ── Weather fetch (Open-Meteo, no key) ────────────────────────────────────
  useEffect(() => {
    if (!gps) return;
    if (weatherRef.current) clearTimeout(weatherRef.current);
    weatherRef.current = setTimeout(async () => {
      setWeatherLoading(true);
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${gps.lat.toFixed(4)}&longitude=${gps.lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,apparent_temperature&wind_speed_unit=kmh&timezone=auto`;
        const res  = await fetch(url);
        const data = await res.json();
        setWeather(data.current);
      } catch (e) {
        console.warn("Weather fetch failed", e);
      } finally {
        setWeatherLoading(false);
      }
    }, 800); // debounce 800ms
  }, [gps?.lat?.toFixed(3), gps?.lng?.toFixed(3)]); // only re-fetch if position changed meaningfully

  const currentKm    = progress * TOTAL_KM;
  const currentStnIdx = STATIONS.findIndex((s, i) => i === STATIONS.length - 1 ? true : currentKm < STATIONS[i + 1].km);
  const currentStn   = STATIONS[Math.min(currentStnIdx, STATIONS.length - 1)];
  const nextStn      = STATIONS[Math.min(currentStnIdx + 1, STATIONS.length - 1)];

  const liveSignal    = useMemo(() => Object.fromEntries(CARRIERS.map(c => [c, getSignalAt(currentKm, c)])), [currentKm]);
  const overallSignal = Math.max(...CARRIERS.filter(c => activeCarriers.has(c)).map(c => liveSignal[c]), 0);
  const bestCarrier   = CARRIERS.filter(c => activeCarriers.has(c)).reduce((b, c) => liveSignal[c] > (liveSignal[b] || 0) ? c : b, CARRIERS[0]);

  const nextDeadZone = getNextDeadZone(currentKm, TRAIN_KMH);
  const recovery     = getSignalRecovery(currentKm, TRAIN_KMH);
  const inDeadZone   = DEAD_ZONES.some(dz => currentKm >= dz.start && currentKm <= dz.end);
  const visibleTowers = ALL_TOWERS.filter(t => activeCarriers.has(t.carrier) && Math.abs(t.km - currentKm) < 82);

  const tick = useCallback((ts) => {
    if (!lastTimeRef.current) lastTimeRef.current = ts;
    const dt = (ts - lastTimeRef.current) / 1000;
    lastTimeRef.current = ts;
    setProgress(p => { const n = p + (dt * speed * 0.0006); if (n >= 1) { setIsPlaying(false); return 1; } return n; });
    rafRef.current = requestAnimationFrame(tick);
  }, [speed]);

  useEffect(() => {
    if (isPlaying) { lastTimeRef.current = null; rafRef.current = requestAnimationFrame(tick); }
    else { if (rafRef.current) cancelAnimationFrame(rafRef.current); }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, tick]);

  const toggleCarrier = c => setActiveCarriers(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const PANEL_W = 700, PANEL_H = 260, MID_Y = PANEL_H / 2;
  const kmToX    = km => (km - currentKm) / 82 * (PANEL_W / 2) + PANEL_W / 2;
  const terrain  = getTerrainColor(currentKm);
  const urgency  = nextDeadZone ? nextDeadZone.minsAway <= 5 ? "#dc2626" : nextDeadZone.minsAway <= 15 ? "#f59e0b" : "#22c55e" : "#22c55e";
  const lastUpdateStr = lastUpdate ? lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;

  return (
    <div style={{ fontFamily: "'JetBrains Mono','Courier New',monospace", background: "#0a0e1a", color: "#e2e8f0", minHeight: "100vh", padding: "20px 16px", maxWidth: 760, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: 4, textTransform: "uppercase", marginBottom: 4 }}>SRT Special Express · Train #14</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f1f5f9", letterSpacing: -0.5 }}>🚂 CNX → BKK Cell Towers</h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, background: gpsStatus === "tracking" ? "#052e16" : "#1a1a2e", border: `1px solid ${gpsStatus === "tracking" ? "#10b98144" : "#374151"}`, borderRadius: 20, padding: "5px 14px" }}>
          <span style={{ fontSize: 10, color: gpsStatus === "tracking" ? "#10b981" : gpsStatus === "error" ? "#dc2626" : "#f59e0b" }}>{gpsStatus === "tracking" ? "⬤" : gpsStatus === "error" ? "✕" : "◌"}</span>
          {gpsStatus === "waiting" && <span style={{ fontSize: 11, color: "#9ca3af" }}>Requesting GPS…</span>}
          {gpsStatus === "error"   && <span style={{ fontSize: 11, color: "#fca5a5" }}>GPS error: {gpsError}</span>}
          {gpsStatus === "tracking" && gps && (<><span style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 700 }}>📍 {locationName}</span><span style={{ fontSize: 10, color: "#6b7280" }}>KM {userKm}</span><span style={{ fontSize: 10, color: "#374151" }}>±{gps.accuracy}m</span>{lastUpdateStr && <span style={{ fontSize: 9, color: "#4b5563" }}>Updated {lastUpdateStr}</span>}</>)}
          {manualMode && <span style={{ fontSize: 9, color: "#f59e0b", background: "#f59e0b22", borderRadius: 4, padding: "1px 6px", marginLeft: 4 }}>MANUAL</span>}
        </div>
        {gps && <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4 }}>{gps.lat.toFixed(5)}°N · {gps.lng.toFixed(5)}°E · ±{gps.accuracy}m · updated {lastUpdateStr}</div>}
      </div>

      {/* ── LIVE TELEMETRY ── */}
      {gps && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>🛰️ Live Train Telemetry</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>

            {/* SPEED */}
            <div style={{ background: "#111827", borderRadius: 10, padding: "12px 8px", textAlign: "center", border: "1px solid #1f2937" }}>
              <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Speed</div>
              {gps.speedKmh != null && gps.speedKmh > 0.5 ? (
                <>
                  <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: gps.speedKmh > 100 ? "#f59e0b" : gps.speedKmh > 50 ? "#22c55e" : "#94a3b8", transition: "color 0.5s" }}>{Math.round(gps.speedKmh)}</div>
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>km/h</div>
                  <div style={{ marginTop: 6, background: "#1f2937", borderRadius: 3, height: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: "#22c55e", width: `${Math.min(100, (gps.speedKmh / 160) * 100)}%`, transition: "width 0.5s" }} />
                  </div>
                </>
              ) : (
                <><div style={{ fontSize: 20, marginTop: 4 }}>🛑</div><div style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>Stopped</div></>
              )}
            </div>

            {/* HEADING */}
            <div style={{ background: "#111827", borderRadius: 10, padding: "12px 8px", textAlign: "center", border: "1px solid #1f2937" }}>
              <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Heading</div>
              {gps.heading != null && gps.speedKmh > 1 ? (
                <>
                  <div style={{ position: "relative", width: 44, height: 44, margin: "0 auto" }}>
                    <svg viewBox="0 0 44 44" width={44} height={44}>
                      <circle cx={22} cy={22} r={20} fill="#1f2937" stroke="#374151" strokeWidth={1} />
                      {["N", "E", "S", "W"].map((d, i) => <text key={d} x={22 + 16 * Math.sin(i * Math.PI / 2)} y={22 - 16 * Math.cos(i * Math.PI / 2) + 3} textAnchor="middle" fontSize={6} fill={d === "N" ? "#ef4444" : "#4b5563"} fontFamily="monospace">{d}</text>)}
                      <g transform={`rotate(${gps.heading},22,22)`}>
                        <polygon points="22,4 19,22 22,18 25,22" fill="#f59e0b" />
                        <polygon points="22,40 19,22 22,26 25,22" fill="#374151" />
                      </g>
                    </svg>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", marginTop: 2 }}>{windDirLabel(gps.heading)}</div>
                </>
              ) : (
                <><div style={{ fontSize: 20, marginTop: 4 }}>🧭</div><div style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>No heading</div></>
              )}
            </div>

            {/* WIND SPEED (Open-Meteo) */}
            <div style={{ background: "#111827", borderRadius: 10, padding: "12px 8px", textAlign: "center", border: "1px solid #1f2937", position: "relative" }}>
              <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Wind</div>
              {weatherLoading && <div style={{ fontSize: 9, color: "#4b5563", marginTop: 8 }}>fetching…</div>}
              {!weatherLoading && weather ? (
                <>
                  {/* Animated wind icon using SVG */}
                  <div style={{ position: "relative", width: 40, height: 40, margin: "0 auto" }}>
                    <svg viewBox="0 0 40 40" width={40} height={40}>
                      <circle cx={20} cy={20} r={18} fill="#1f2937" stroke="#374151" strokeWidth={1} />
                      {/* Wind direction arrow (meteorological: where wind comes FROM, arrow points TO) */}
                      <g transform={`rotate(${weather.wind_direction_10m + 180},20,20)`}>
                        <line x1={20} y1={6} x2={20} y2={30} stroke="#60a5fa" strokeWidth={2} strokeLinecap="round" />
                        <polygon points="20,4 17,12 23,12" fill="#60a5fa" />
                      </g>
                    </svg>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, color: weather.wind_speed_10m > 30 ? "#f59e0b" : "#60a5fa", marginTop: 2 }}>{Math.round(weather.wind_speed_10m)}</div>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>km/h {windDirLabel(weather.wind_direction_10m)}</div>
                  {weather.wind_gusts_10m && <div style={{ fontSize: 8, color: "#4b5563", marginTop: 2 }}>gusts {Math.round(weather.wind_gusts_10m)} km/h</div>}
                  <div style={{ fontSize: 7, color: "#374151", marginTop: 2 }}>{beaufortDesc(weather.wind_speed_10m)}</div>
                </>
              ) : !weatherLoading && (
                <><div style={{ fontSize: 20, marginTop: 4 }}>💨</div><div style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>No GPS yet</div></>
              )}
            </div>

            {/* WEATHER / TEMP */}
            <div style={{ background: "#111827", borderRadius: 10, padding: "12px 8px", textAlign: "center", border: "1px solid #1f2937" }}>
              <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Weather</div>
              {weather ? (
                <>
                  <div style={{ fontSize: 26, lineHeight: 1, marginTop: 2 }}>{weatherCodeIcon(weather.weather_code)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#fb923c", marginTop: 4 }}>{Math.round(weather.temperature_2m)}°C</div>
                  <div style={{ fontSize: 8, color: "#6b7280" }}>feels {Math.round(weather.apparent_temperature)}°C</div>
                  <div style={{ fontSize: 8, color: "#4b5563", marginTop: 1 }}>💧 {weather.relative_humidity_2m}%</div>
                </>
              ) : (
                <><div style={{ fontSize: 20, marginTop: 4 }}>🌡️</div><div style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>Loading…</div></>
              )}
            </div>
          </div>

          {/* Second row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 10 }}>
            <div style={{ background: "#111827", borderRadius: 10, padding: "10px", textAlign: "center", border: "1px solid #1f2937" }}>
              <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>To Bangkok</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0" }}>{Math.max(0, TOTAL_KM - Math.round(currentKm))}</div>
              <div style={{ fontSize: 9, color: "#6b7280" }}>km remaining</div>
            </div>
            <div style={{ background: "#111827", borderRadius: 10, padding: "10px", textAlign: "center", border: "1px solid #1f2937" }}>
              <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>ETA Bangkok</div>
              {(() => {
                const kmLeft = Math.max(0, TOTAL_KM - currentKm);
                const spd = (gps.speedKmh != null && gps.speedKmh > 5) ? gps.speedKmh : TRAIN_KMH;
                const minsLeft = Math.round((kmLeft / spd) * 60);
                const hrs = Math.floor(minsLeft / 60), mins = minsLeft % 60;
                const eta = new Date(Date.now() + minsLeft * 60000);
                return (<><div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{hrs}h {mins}m</div><div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>~{eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div><div style={{ fontSize: 8, color: "#4b5563", marginTop: 1 }}>{gps.speedKmh != null && gps.speedKmh > 5 ? "live speed" : "avg 65 km/h"}</div></>);
              })()}
            </div>
            <div style={{ background: "#111827", borderRadius: 10, padding: "10px", textAlign: "center", border: "1px solid #1f2937" }}>
              <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Altitude</div>
              {gps.altitude != null ? (
                <><div style={{ fontSize: 22, fontWeight: 700, color: "#818cf8" }}>{gps.altitude}</div><div style={{ fontSize: 9, color: "#6b7280" }}>metres asl</div><div style={{ fontSize: 8, color: "#4b5563", marginTop: 2 }}>{gps.altitude > 400 ? "⛰️ Highland" : gps.altitude > 100 ? "🌄 Mid" : "🌾 Plains"}</div></>
              ) : (
                <><div style={{ fontSize: 20, marginTop: 4 }}>⛰️</div><div style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>No altitude</div></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DEAD ZONE COUNTDOWN ── */}
      {inDeadZone ? (
        <div style={{ background: "#1a0505", border: "2px solid #dc262688", borderRadius: 14, padding: "16px 18px", marginBottom: 14, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 36 }}>📵</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>YOU'RE IN A DEAD ZONE</div>
            <div style={{ fontSize: 11, color: "#f87171", marginTop: 2 }}>{DEAD_ZONES.find(dz => currentKm >= dz.start && currentKm <= dz.end)?.name}</div>
            {recovery && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Signal returns in <span style={{ color: "#22c55e", fontWeight: 700 }}>~{recovery.minsAway} min</span> · KM {recovery.km} · {recovery.kmAway} km ahead</div>}
          </div>
        </div>
      ) : nextDeadZone ? (
        <div style={{ background: `${urgency}0d`, border: `2px solid ${urgency}55`, borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ background: `${urgency}22`, border: `1px solid ${urgency}55`, borderRadius: 12, padding: "10px 18px", textAlign: "center", minWidth: 90 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: urgency, lineHeight: 1 }}>{nextDeadZone.minsAway}</div>
              <div style={{ fontSize: 10, color: urgency, marginTop: 2, opacity: 0.8 }}>minutes</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: urgency, marginBottom: 4 }}>{nextDeadZone.severity === "complete" ? "⚠️ Signal cuts out completely" : "⚠️ Signal goes weak"}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}><strong style={{ color: "#e2e8f0" }}>{nextDeadZone.name}</strong></div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{nextDeadZone.kmAway} km away · KM {nextDeadZone.start}–{nextDeadZone.end} · lasts ~{nextDeadZone.duration} min</div>
              {nextDeadZone.minsAway <= 10 && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 6, fontWeight: 600 }}>💡 Download stuff now!</div>}
            </div>
            <PhoneSignal bars={overallSignal} size="xl" showLabel={false} />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>Distance to dead zone · KM {Math.round(currentKm)} → KM {nextDeadZone.start}</div>
            <div style={{ background: "#1f2937", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(to right,${urgency},${urgency}88)`, width: `${Math.max(2, 100 - (nextDeadZone.kmAway / 120) * 100)}%`, transition: "width 0.5s" }} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: "#052e1622", border: "1px solid #10b98144", borderRadius: 14, padding: "12px 18px", marginBottom: 14, fontSize: 12, color: "#6ee7b7" }}>
          ✅ No dead zones ahead — smooth signal to Bangkok
        </div>
      )}

      {/* ── LIVE SIGNAL ── */}
      <div style={{ background: "#0f172a", border: `1.5px solid ${signalColor(overallSignal)}44`, borderRadius: 14, padding: "14px 16px", marginBottom: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>📱 Live Signal · KM {Math.round(currentKm)}</div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
            {CARRIERS.map(c => (
              <div key={c} style={{ opacity: activeCarriers.has(c) ? 1 : 0.3 }}>
                <PhoneSignal bars={activeCarriers.has(c) ? liveSignal[c] : 0} carrier={c} band={ALL_TOWERS.find(t => t.carrier === c)?.band || "4G"} size="lg" />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 16px", background: `${signalColor(overallSignal)}11`, border: `1px solid ${signalColor(overallSignal)}33`, borderRadius: 10, minWidth: 100, textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 2 }}>{overallSignal <= 1 ? "📵" : "📶"}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: signalColor(overallSignal) }}>{signalLabel(overallSignal)}</div>
          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>Best: {bestCarrier}</div>
        </div>
      </div>

      {/* ── FORECAST STRIP ── */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: 2, textTransform: "uppercase" }}>📊 Signal forecast — next 80 km</div>
          {nextDeadZone && <div style={{ fontSize: 10, color: urgency }}>⚡ Dead zone in {nextDeadZone.minsAway} min</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CARRIERS.filter(c => activeCarriers.has(c)).map(c => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: CARRIER_COLORS[c], width: 32, fontWeight: 700 }}>{c}</span>
              <div style={{ flex: 1, position: "relative" }}>
                <SignalForecast currentKm={currentKm} carrier={c} />
                {nextDeadZone && nextDeadZone.kmAway <= 80 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(nextDeadZone.kmAway / 80) * 100}%`, width: `${((nextDeadZone.end - nextDeadZone.start) / 80) * 100}%`, background: "#dc262622", border: "1px solid #dc262644", borderRadius: 1, pointerEvents: "none" }} />}
              </div>
              <span style={{ fontSize: 9, color: "#6b7280", width: 28, textAlign: "right" }}>+80km</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── TRACK AHEAD MAP ── */}
      <TrackAheadMap currentKm={currentKm} userKm={userKm} />

      {/* ── TRAIN WINDOW ── */}
      <div style={{ background: "#111827", border: "2px solid #1f2937", borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ background: "#1f2937", padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #374151" }}>
          <span style={{ fontSize: 11, color: "#6b7280" }}>WINDOW VIEW — OUTSIDE</span>
          <span style={{ fontSize: 11, color: "#10b981" }}>⬤ {currentStn.name} → {nextStn.name}</span>
        </div>
        <svg width="100%" viewBox={`0 0 ${PANEL_W} ${PANEL_H}`} style={{ display: "block", cursor: "crosshair" }}>
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#020617" /><stop offset="60%" stopColor="#0f172a" /><stop offset="100%" stopColor={terrain} />
            </linearGradient>
          </defs>
          <rect width={PANEL_W} height={PANEL_H} fill="url(#sky)" />
          {Array.from({ length: 60 }, (_, i) => <circle key={i} cx={(i * 137.508) % PANEL_W} cy={(i * 93.12) % (MID_Y - 30)} r={0.8} fill="#e2e8f0" opacity={0.3 + (i % 5) * 0.14} />)}
          <circle cx={60} cy={38} r={14} fill="#f1f5f9" opacity={0.9} />
          <circle cx={67} cy={34} r={11} fill="#0f172a" opacity={0.95} />
          <path d={`M0,${MID_Y + 60} Q${PANEL_W * .1},${MID_Y + 30} ${PANEL_W * .2},${MID_Y + 55} Q${PANEL_W * .3},${MID_Y + 20} ${PANEL_W * .45},${MID_Y + 50} Q${PANEL_W * .6},${MID_Y + 70} ${PANEL_W * .75},${MID_Y + 35} Q${PANEL_W * .9},${MID_Y + 15} ${PANEL_W},${MID_Y + 45} L${PANEL_W},${PANEL_H} L0,${PANEL_H} Z`} fill={terrain} opacity={0.8} />
          <rect x={0} y={MID_Y + 80} width={PANEL_W} height={PANEL_H} fill={terrain} />
          <line x1={0} y1={MID_Y + 82} x2={PANEL_W} y2={MID_Y + 82} stroke="#374151" strokeWidth={2} />
          {Array.from({ length: 20 }, (_, i) => { const tx = ((i / 20) * PANEL_W - (progress * 200 % (PANEL_W / 20))) % PANEL_W; return <rect key={i} x={tx} y={MID_Y + 79} width={16} height={6} fill="#1f2937" rx={1} />; })}
          {DEAD_ZONES.map(dz => { const x1 = kmToX(dz.start), x2 = kmToX(dz.end); if (x2 < 0 || x1 > PANEL_W) return null; return (<g key={dz.name}><rect x={Math.max(0, x1)} y={0} width={Math.min(PANEL_W, x2) - Math.max(0, x1)} height={PANEL_H} fill="#dc2626" opacity={dz.severity === "complete" ? 0.08 : 0.04} /><line x1={Math.max(0, x1)} y1={0} x2={Math.max(0, x1)} y2={PANEL_H} stroke="#dc2626" strokeWidth={1} strokeDasharray="4,3" opacity={0.4} /><text x={(Math.max(0, x1) + Math.min(PANEL_W, x2)) / 2} y={16} textAnchor="middle" fontSize={7} fill="#dc2626" fontFamily="monospace" opacity={0.7}>{dz.severity === "complete" ? "NO SIGNAL" : "WEAK"}</text></g>); })}
          {STATIONS.map(stn => { const x = kmToX(stn.km); if (x < -20 || x > PANEL_W + 20) return null; return (<g key={stn.name}><rect x={x - 12} y={MID_Y + 65} width={24} height={20} rx={2} fill={stn.type === "major" || stn.type === "terminus" ? "#1e40af" : "#374151"} opacity={0.85} /><text x={x} y={MID_Y + 59} textAnchor="middle" fontSize={8} fill="#94a3b8" fontFamily="monospace">{stn.name.split(" ")[0]}</text></g>); })}
          {userKm != null && (() => { const x = kmToX(userKm); if (x < 0 || x > PANEL_W) return null; return (<g><line x1={x} y1={MID_Y + 55} x2={x} y2={MID_Y + 88} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="3,2" /><circle cx={x} cy={MID_Y + 60} r={6} fill="#3b82f644" stroke="#3b82f6" strokeWidth={1.5} /><text x={x} y={MID_Y + 51} textAnchor="middle" fontSize={7} fill="#93c5fd" fontFamily="monospace" fontWeight="700">YOU</text></g>); })()}
          {visibleTowers.map(t => { const x = kmToX(t.km); if (x < 0 || x > PANEL_W) return null; const isNear = Math.abs(t.km - currentKm) < 12, isHovered = hoveredTower?.id === t.id, baseY = MID_Y + 40, towerH = 28 + t.signal * 6, alpha = Math.max(0.15, 1 - Math.abs(t.km - currentKm) / 82); return (<g key={t.id} style={{ cursor: "pointer" }} opacity={alpha} onMouseEnter={() => setHoveredTower(t)} onMouseLeave={() => setHoveredTower(null)}>{isNear && <ellipse cx={x} cy={baseY - towerH / 2} rx={24} ry={24} fill={t.color} opacity={0.12} />}<line x1={x} y1={baseY} x2={x} y2={baseY - towerH} stroke={t.color} strokeWidth={isHovered ? 2.5 : 1.5} />{[0.3, 0.6, 0.85].map(f => <line key={f} x1={x - 7 * (1 - f)} y1={baseY - towerH * f} x2={x + 7 * (1 - f)} y2={baseY - towerH * f} stroke={t.color} strokeWidth={1.2} />)}{isNear && <circle cx={x} cy={baseY - towerH} r={10} fill="none" stroke={t.color} strokeWidth={0.8} opacity={0.6} style={{ animation: "pulse 2s infinite" }} />}<circle cx={x} cy={baseY - towerH} r={isHovered ? 4 : 2.5} fill={t.color} opacity={isHovered ? 1 : 0.85} />{isHovered && (<g><rect x={x - 28} y={baseY - towerH - 28} width={56} height={22} rx={3} fill="#0f172a" stroke={t.color} strokeWidth={0.8} /><text x={x} y={baseY - towerH - 18} textAnchor="middle" fontSize={9} fill={t.color} fontFamily="monospace" fontWeight="700">{t.carrier} · {t.band}</text><text x={x} y={baseY - towerH - 8} textAnchor="middle" fontSize={8} fill="#94a3b8" fontFamily="monospace">{signalLabel(t.signal)} · KM {Math.round(t.km)}</text></g>)}</g>); })}
          <g transform={`translate(${PANEL_W / 2},${MID_Y + 80})`}><polygon points="0,-12 -9,0 9,0" fill="#f59e0b" opacity={0.9} /><rect x={-14} y={0} width={28} height={3} fill="#f59e0b" opacity={0.7} /></g>
          {isPlaying && [1, 2, 3, 4, 5].map(i => <line key={i} x1={PANEL_W / 2 - 30 - i * 12} y1={MID_Y + 72 + i * 2} x2={PANEL_W / 2 - 10 - i * 8} y2={MID_Y + 72 + i * 2} stroke="#f59e0b" strokeWidth={0.8} opacity={0.4 - i * 0.06} />)}
          {CARRIERS.map((c, ci) => { const bars = activeCarriers.has(c) ? liveSignal[c] : 0, col = CARRIER_COLORS[c], bx = PANEL_W - 14 - ci * 22; return (<g key={c}>{[1, 2, 3, 4].map(b => <rect key={b} x={bx + b * 3 - 12} y={16 - (b / 4) * 14} width={3} height={(b / 4) * 14} rx={1} fill={b <= bars ? col : "#1f293788"} />)}<text x={bx - 3} y={22} textAnchor="middle" fontSize={6} fill={col} fontFamily="monospace" opacity={activeCarriers.has(c) ? 0.9 : 0.2}>{c}</text></g>); })}
          <text x={12} y={PANEL_H - 10} fontSize={9} fill="#6b7280" fontFamily="monospace">← 80 km window →</text>
          <text x={PANEL_W - 12} y={PANEL_H - 10} textAnchor="end" fontSize={9} fill="#6b7280" fontFamily="monospace">KM {Math.round(currentKm)}</text>
        </svg>
        <div style={{ background: "#1f2937", padding: "6px 16px", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280", borderTop: "1px solid #374151" }}>
          <span>🗼 {visibleTowers.length} towers visible</span><span>{currentStn.dep} · {Math.round(progress * 100)}%</span>
        </div>
      </div>

      {/* Hover info */}
      {hoveredTower && (
        <div style={{ background: "#0f172a", border: `1px solid ${CARRIER_COLORS[hoveredTower.carrier]}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 16, alignItems: "center", fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: CARRIER_COLORS[hoveredTower.carrier] }}>{hoveredTower.carrier}</div>
          <div style={{ color: "#6b7280" }}>{hoveredTower.band}</div>
          <div style={{ color: "#94a3b8" }}>KM {Math.round(hoveredTower.km)}</div>
          <PhoneSignal bars={hoveredTower.signal} size="sm" showLabel={false} />
          <div style={{ fontSize: 10, color: signalColor(hoveredTower.signal), fontWeight: 600 }}>{signalLabel(hoveredTower.signal)}</div>
        </div>
      )}

      {/* Controls */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ marginBottom: 12 }}>
          <input type="range" min={0} max={1000} value={Math.round(progress * 1000)} onChange={e => { setProgress(e.target.value / 1000); setManualMode(true); setIsPlaying(false); }} style={{ width: "100%", accentColor: "#f59e0b", cursor: "pointer" }} />
          <div style={{ position: "relative", height: 22, marginTop: 2 }}>
            {STATIONS.map(stn => (<div key={stn.name} style={{ position: "absolute", left: `${(stn.km / TOTAL_KM) * 100}%`, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}><div style={{ width: stn.type === "major" || stn.type === "terminus" ? 6 : 3, height: stn.type === "major" || stn.type === "terminus" ? 6 : 3, borderRadius: "50%", background: stn.type === "major" ? "#3b82f6" : stn.type === "terminus" ? "#10b981" : "#6b7280" }} />{(stn.type === "major" || stn.type === "terminus") && <span style={{ fontSize: 7, color: "#6b7280", marginTop: 1, whiteSpace: "nowrap" }}>{stn.name.split(" ")[0]}</span>}</div>))}
            {userKm != null && <div style={{ position: "absolute", left: `${(userKm / TOTAL_KM) * 100}%`, transform: "translateX(-50%)", top: -5, width: 12, height: 12, borderRadius: "50%", background: "#3b82f6", border: "2px solid #93c5fd", boxShadow: "0 0 8px #3b82f6" }} />}
          </div>
          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>{userKm != null ? `🔵 GPS: ${locationName} · KM ${userKm}` : "🔵 = your GPS position"}{manualMode && " · Manual override active"}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => { setIsPlaying(p => !p); setManualMode(true); }} style={{ background: isPlaying ? "#7f1d1d" : "#14532d", border: "none", borderRadius: 8, padding: "8px 18px", color: "#fff", fontFamily: "monospace", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>{isPlaying ? "⏸ Pause" : "▶ Simulate"}</button>
          <span style={{ fontSize: 11, color: "#6b7280" }}>Speed:</span>
          {[0.5, 1, 2, 5].map(s => <button key={s} onClick={() => setSpeed(s)} style={{ background: speed === s ? "#1e40af" : "#1f2937", border: "none", borderRadius: 6, padding: "5px 10px", color: speed === s ? "#fff" : "#9ca3af", fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>{s}×</button>)}
          {manualMode && userKm != null && <button onClick={() => { setManualMode(false); setIsPlaying(false); setProgress(userKm / TOTAL_KM); }} style={{ marginLeft: "auto", background: "#1e3a5f", border: "1px solid #3b82f644", borderRadius: 6, padding: "5px 12px", color: "#93c5fd", fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>📍 Snap to GPS</button>}
        </div>
      </div>

      {/* Carrier filters */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 10, letterSpacing: 2, textTransform: "uppercase" }}>Filter Carriers</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CARRIERS.map(c => { const active = activeCarriers.has(c), bars = liveSignal[c]; return (<button key={c} onClick={() => toggleCarrier(c)} style={{ background: active ? `${CARRIER_COLORS[c]}22` : "#1f2937", border: `1.5px solid ${active ? CARRIER_COLORS[c] : "#374151"}`, borderRadius: 8, padding: "7px 14px", color: active ? CARRIER_COLORS[c] : "#6b7280", fontFamily: "monospace", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontWeight: 700 }}>{c}</span><span style={{ fontSize: 9, opacity: 0.6 }}>{ALL_TOWERS.filter(t => t.carrier === c).length}t</span>{active && <span style={{ display: "inline-flex", gap: 1, alignItems: "flex-end", height: 12 }}>{[1, 2, 3, 4].map(b => <span key={b} style={{ width: 3, height: (b / 4) * 12, display: "inline-block", borderRadius: 1, background: b <= bars ? signalColor(bars) : "#374151" }} />)}</span>}</button>); })}
        </div>
      </div>

      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 10, padding: "10px 14px", fontSize: 11, color: "#6b7280" }}>
        <strong style={{ color: "#9ca3af" }}>Data sources:</strong> GPS via browser · Weather via Open-Meteo (CC BY 4.0) · Tower positions modelled from SRT Northern Line density. Real tower data at <span style={{ color: "#3b82f6" }}>cellmapper.net</span> (MCC 520).
      </div>

      <style>{`@keyframes pulse{0%{r:6;opacity:0.7}100%{r:18;opacity:0}}`}</style>
    </div>
  );
}
