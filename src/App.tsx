import React, { useState, useEffect, useMemo } from 'react';

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbztAPOnM-3qx2vgt-cLCY50G4tK3XsW8BPGNja75g6K4fi7RM4uXkWRxdI-vi-_VEGj/exec";
const CACHE_KEY = "emo-hub-wise-cache-v2";

export default function App() {
  const [allMonthData, setAllMonthData] = useState<Record<string, any[]>>({});
  const [currentHubsData, setCurrentHubsData] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'success' | 'error' | 'info'>('info');
  const [statusMessage, setStatusMessage] = useState('LOADING DATA...');
  const [isSpinning, setIsSpinning] = useState(false);
  const [liveTime, setLiveTime] = useState('');

  // Live clock
  useEffect(() => {
    const updateClock = () => {
      setLiveTime(new Date().toLocaleTimeString("en-IN", { hour12: true }));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const num = (value: any, fallback = 0) => {
    if (value === null || value === undefined || value === "") return fallback;
    const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").replace(/%$/, "").trim());
    return Number.isFinite(n) ? n : fallback;
  };

  const percent = (value: any) => Math.max(0, Math.min(100, num(value)));

  const rowsOf = (rows: any[]) => {
    return Array.isArray(rows) 
      ? rows.filter(x => x && typeof x === "object" && !Array.isArray(x))
        .map((x, i) => ({ ...x, hub: (x.hub && String(x.hub).trim()) || `Unnamed hub ${i + 1}` })) 
      : [];
  };

  const normalizeDates = (value: any) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([date, rows]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(rows))
        .map(([date, rows]) => [date, rowsOf(rows as any[])])
    );
  };

  // Load cache on mount
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && cached.dataByDate) {
        const normalized = normalizeDates(cached.dataByDate);
        if (Object.keys(normalized).length > 0) {
          setAllMonthData(normalized);
          setStatusMessage("LOCAL CACHE LOADED");
          setSyncStatus('info');
        }
      }
    } catch (e) {
      console.warn("Cache load failed", e);
    }
    syncFromCloud();
    const interval = setInterval(syncFromCloud, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const syncFromCloud = async () => {
    setIsSpinning(true);
    setSyncStatus('syncing');
    setStatusMessage('SYNCING WITH SHEET...');
    try {
      const response = await fetch(APPS_SCRIPT_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`Cloud request failed (${response.status})`);
      const json = await response.json();
      if (!json || json.status !== "success" || !json.dataByDate || typeof json.dataByDate !== "object") {
        throw new Error("Unexpected sheet response");
      }
      const normalized = normalizeDates(json.dataByDate);
      setAllMonthData(normalized);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), dataByDate: normalized }));
      } catch (err) {}

      // Handle date ranges
      const dates = Object.keys(normalized).sort();
      if (dates.length > 0 && !normalized[selectedDate]) {
        setSelectedDate(dates[dates.length - 1]);
      }
      setSyncStatus('success');
      setStatusMessage('CLOUD SYNCED');
    } catch (err) {
      console.warn("Cloud sync error:", err);
      setSyncStatus('error');
      setStatusMessage('OFFLINE • SHOWING CACHED DATA');
    } finally {
      setTimeout(() => setIsSpinning(false), 500);
    }
  };

  // Update current hubs when selectedDate or allMonthData changes
  useEffect(() => {
    const rows = rowsOf(allMonthData[selectedDate] || []);
    setCurrentHubsData(rows);
  }, [selectedDate, allMonthData]);

  const dateKeys = useMemo(() => {
    return Object.keys(allMonthData).filter(d => Array.isArray(allMonthData[d])).sort();
  }, [allMonthData]);

  const freshnessInfo = useMemo(() => {
    const dates = dateKeys;
    const latest = dates.length ? dates[dates.length - 1] : null;
    if (!latest) return { text: "NO REPORT DATE AVAILABLE", style: "bg-slate-50 text-slate-500 border-slate-200" };
    
    const today = Date.parse(`${new Date().toISOString().split('T')[0]}T00:00:00Z`);
    const dataDate = Date.parse(`${latest}T00:00:00Z`);
    if (!Number.isFinite(today) || !Number.isFinite(dataDate)) {
      return { text: `LATEST DATA: ${latest}`, style: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    const age = Math.floor((today - dataDate) / 86400000);
    if (age < 0) return { text: `LATEST DATE IS IN FUTURE: ${latest}`, style: "bg-amber-50 text-amber-700 border-amber-200" };
    
    const text = age === 0 ? `DATA CURRENT • ${latest}` : `${age} DAY${age === 1 ? "" : "S"} OLD • LATEST ${latest}`;
    const style = age === 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : age === 1 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-rose-50 text-rose-700 border-rose-200";
    return { text, style };
  }, [dateKeys]);

  const totalOfd = useMemo(() => {
    return currentHubsData.reduce((s, x) => s + Math.max(0, num(x.ofd)), 0);
  }, [currentHubsData]);

  const weightedProgress = (field: string) => {
    const total = currentHubsData.reduce((s, x) => s + Math.max(0, num(x.ofd)), 0);
    return total ? currentHubsData.reduce((s, x) => s + Math.max(0, num(x.ofd)) * percent(x[field]), 0) / total : 0;
  };

  const top8Am = useMemo(() => {
    return [...currentHubsData].sort((a, b) => num(b.emo8) - num(a.emo8)).slice(0, 5);
  }, [currentHubsData]);

  const top10Am = useMemo(() => {
    return [...currentHubsData].sort((a, b) => num(b.emo10) - num(a.emo10)).slice(0, 5);
  }, [currentHubsData]);

  const criticalHubs = useMemo(() => {
    return [...currentHubsData].sort((a, b) => num(a.emo10) - num(b.emo10)).slice(0, 5);
  }, [currentHubsData]);

  const filteredTableRows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return currentHubsData.filter(item => String(item.hub || '').toLowerCase().includes(query));
  }, [currentHubsData, searchQuery]);

  const getHubStatus = (item: any) => {
    const e8 = num(item.emo8), e10 = num(item.emo10), e12 = num(item.emo12);
    if (e10 >= 80 || e12 >= 95) return "on-track";
    if (e8 < 15 && e10 < 45) return "projected-risk";
    if (e10 < 30) return "high-risk";
    return "attention";
  };

  const renderStatusBadge = (item: any) => {
    const status = getHubStatus(item);
    if (status === 'on-track') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">On Track</span>;
    if (status === 'projected-risk') return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200 shadow-sm">🔮 Projected Risk</span>;
    if (status === 'high-risk') return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">High Risk</span>;
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">Attention</span>;
  };

  const getMedalBadge = (rank: number) => {
    const cls = rank === 1 ? "from-amber-300 via-amber-400 to-yellow-500 text-amber-950 border-amber-200" : rank === 2 ? "from-slate-200 via-slate-300 to-slate-400 text-slate-800 border-slate-200" : rank === 3 ? "from-amber-600 via-amber-700 to-orange-700 text-white border-amber-500" : "bg-slate-100 text-slate-600";
    return <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-gradient-to-br ${cls}`}>{rank}</span>;
  };

  return (
    <div className="bg-[#f4f7fb] text-slate-800 min-h-screen flex flex-col p-4 md:p-6 antialiased selection:bg-blue-100 font-sans">
      
      {/* Top Header */}
      <header className="max-w-7xl mx-auto w-full mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">EMO HUB WISE</h1>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-custom-pulse"></span>
              ACTIVE ({currentHubsData.length} HUBS)
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs font-bold">
            <span className="text-blue-600 uppercase tracking-wider">SARFARAZ NAWAB SPAN</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">Live Time: <span className="font-mono text-slate-800 font-bold">{liveTime || '--:--:--'}</span></span>
          </div>
        </div>

        {/* Controls: Refresh + Calendar Date Picker */}
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={syncFromCloud} 
            title="Sync Live Data" 
            className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shadow-md cursor-pointer transition-all active:scale-95"
          >
            <svg className={`w-4 h-4 transition-transform duration-500 ${isSpinning ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </button>
          
          <div className="card-3d bg-white p-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-2 shadow-sm">
            <span className="text-blue-600 text-sm">📅</span>
            <span className="text-slate-400 uppercase text-[11px]">DATE:</span>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)} 
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="max-w-7xl mx-auto w-full space-y-6 flex-1">
        
        {/* Top 4 Clean Minimal KPI Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* TOTAL OFD */}
          <div className="card-3d bg-white border border-slate-200/80 shadow-sm p-4 rounded-2xl flex justify-between items-center transition-all hover:shadow-md">
            <div>
              <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">TOTAL OFD</p>
              <h2 className="text-2xl font-black text-slate-900 mt-1">{totalOfd.toLocaleString("en-IN")}</h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center text-lg shadow-inner font-bold">📦</div>
          </div>

          {/* 8 AM EMO PROGRESS */}
          <div className="card-3d bg-white border border-slate-200/80 shadow-sm p-4 rounded-2xl flex justify-between items-center transition-all hover:shadow-md">
            <div>
              <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">8 AM EMO PROGRESS</p>
              <h2 className="text-2xl font-black text-amber-500 mt-1">{weightedProgress("emo8").toFixed(2)}%</h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center text-lg shadow-inner font-bold">⏱️</div>
          </div>

          {/* 10 AM EMO PROGRESS */}
          <div className="card-3d bg-white border border-slate-200/80 shadow-sm p-4 rounded-2xl flex justify-between items-center transition-all hover:shadow-md">
            <div>
              <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">10 AM EMO PROGRESS</p>
              <h2 className="text-2xl font-black text-emerald-600 mt-1">{weightedProgress("emo10").toFixed(2)}%</h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center text-lg shadow-inner font-bold">📈</div>
          </div>

          {/* 12 PM EMO PROGRESS */}
          <div className="card-3d bg-white border border-slate-200/80 shadow-sm p-4 rounded-2xl flex justify-between items-center transition-all hover:shadow-md">
            <div>
              <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">12 PM EMO PROGRESS</p>
              <h2 className="text-2xl font-black text-blue-600 mt-1">{weightedProgress("emo12").toFixed(2)}%</h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center text-lg shadow-inner font-bold">🏆</div>
          </div>
        </div>

        {/* 3-Column Rank & Alert Widgets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 8 AM TOP PERFORMERS */}
          <div className="card-3d bg-white border border-slate-200/80 shadow-sm p-5 rounded-2xl">
            <h3 className="text-xs font-black text-amber-500 uppercase tracking-wider flex items-center gap-2 mb-4">
              <span className="text-base animate-crown">👑</span> 8 AM TOP PERFORMERS
            </h3>
            <div className="space-y-3.5">
              {top8Am.length === 0 ? (
                <p className="text-xs text-slate-400">No hub data available.</p>
              ) : (
                top8Am.map((item, i) => {
                  const pct = percent(item.emo8);
                  return (
                    <div key={item.hub} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-800 truncate max-w-[200px] flex items-center gap-2">
                          {getMedalBadge(i + 1)} {item.hub}
                        </span>
                        <span className="text-amber-500 font-extrabold">{num(item.emo8).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                        <div className="h-2 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 animate-line-blink-amber" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 10 AM TOP PERFORMERS */}
          <div className="card-3d bg-white border border-slate-200/80 shadow-sm p-5 rounded-2xl">
            <h3 className="text-xs font-black text-emerald-600 uppercase tracking-wider flex items-center gap-2 mb-4">
              <span className="text-base animate-crown">🏆</span> 10 AM TOP PERFORMERS
            </h3>
            <div className="space-y-3.5">
              {top10Am.length === 0 ? (
                <p className="text-xs text-slate-400">No hub data available.</p>
              ) : (
                top10Am.map((item, i) => {
                  const pct = percent(item.emo10);
                  return (
                    <div key={item.hub} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-slate-800 truncate max-w-[200px] flex items-center gap-2">
                          {getMedalBadge(i + 1)} {item.hub}
                        </span>
                        <span className="text-emerald-600 font-extrabold">{num(item.emo10).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                        <div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 animate-line-blink-emerald" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* CRITICAL & PREDICTIVE ALERTS */}
          <div className="card-3d bg-white border border-slate-200/80 shadow-sm p-5 rounded-2xl">
            <h3 className="text-xs font-black text-rose-500 uppercase tracking-wider flex items-center gap-2 mb-4">
              <span className="text-base">🚨</span> CRITICAL & SLOW PROGRESS HUBS
            </h3>
            <div className="space-y-3.5">
              {criticalHubs.length === 0 ? (
                <p className="text-xs text-slate-400">No hub data available.</p>
              ) : (
                criticalHubs.map(item => {
                  const value = num(item.emo10);
                  const critical = value < 30;
                  const width = Math.max(5, percent(value));
                  return (
                    <div key={item.hub} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${critical ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-amber-50 text-amber-600 border-amber-200"}`}>
                            {critical ? "Critical" : "Moderate"}
                          </span>
                          <span className="text-slate-800 truncate max-w-[170px]">{item.hub}</span>
                        </div>
                        <span className={critical ? "text-rose-600 font-extrabold" : "text-amber-600 font-extrabold"}>{value.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                        <div className={`h-2 rounded-full ${critical ? "bg-gradient-to-r from-rose-500 to-red-600 animate-line-blink-rose" : "bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 animate-line-blink-amber"}`} style={{ width: `${width}%` }}></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Table Controls & Sync Status Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <span className="px-3.5 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-full shadow-sm">
              Showing {filteredTableRows.length} / {currentHubsData.length} hubs
            </span>
            <div className="relative w-full sm:w-64 md:w-56 flex-none">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search hub name..." 
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider md:justify-end">
            <span>SHOWING DATA FOR: <span className="text-blue-600 font-extrabold">{selectedDate}</span> (<span className={syncStatus === 'success' ? 'text-emerald-600 font-bold' : syncStatus === 'error' ? 'text-rose-500 font-bold' : syncStatus === 'syncing' ? 'text-amber-500 font-bold' : 'text-slate-500 font-bold'}>{statusMessage}</span>)</span>
            <span className={`inline-flex items-center px-2 py-1 rounded-full border ${freshnessInfo.style}`}>
              {freshnessInfo.text}
            </span>
          </div>
        </div>

        {/* Data Table Container */}
        <div className="bg-white border border-slate-200/80 shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto max-h-[550px]">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold tracking-wider">
                <tr>
                  <th className="p-3.5 pl-4 sticky left-0 bg-slate-50 z-20 border-r border-slate-200">HUB LOCATION</th>
                  <th className="p-3.5 text-center">TOTAL OFD</th>
                  <th className="p-3.5 text-center">STATUS</th>
                  <th className="p-3.5 text-center">7AM OFD</th>
                  <th className="p-3.5 text-center">7AM %</th>
                  <th className="p-3.5 text-center">8AM OFD</th>
                  <th className="p-3.5 text-center">8AM %</th>
                  <th className="p-3.5 text-center">9AM OFD</th>
                  <th className="p-3.5 text-center">9AM %</th>
                  <th className="p-3.5 text-center">10AM OFD</th>
                  <th className="p-3.5 text-center">10AM %</th>
                  <th className="p-3.5 text-center">12PM OFD</th>
                  <th className="p-3.5 text-center">12PM %</th>
                  <th className="p-3.5 text-center">2PM OFD</th>
                  <th className="p-3.5 text-center">2PM %</th>
                  <th className="p-3.5 text-center">4PM OFD</th>
                  <th className="p-3.5 text-center">4PM %</th>
                  <th className="p-3.5 text-center">AFTER 4PM</th>
                  <th className="p-3.5 text-center">FINAL %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="p-6 text-center text-slate-400 font-semibold">
                      {currentHubsData.length ? "No hubs match these filters." : "No data available for this date."}
                    </td>
                  </tr>
                ) : (
                  filteredTableRows.map((item) => {
                    const e8 = num(item.emo8), e10 = num(item.emo10), e12 = num(item.emo12);
                    return (
                      <tr key={item.hub} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                        <td className="p-3.5 pl-4 font-bold text-blue-600 sticky left-0 bg-white z-10 border-r border-slate-100">
                          {item.hub}
                        </td>
                        <td className="p-3.5 text-center font-black text-slate-800">{num(item.ofd).toLocaleString("en-IN")}</td>
                        <td className="p-3.5 text-center">{renderStatusBadge(item)}</td>
                        <td className="p-3.5 text-center font-semibold text-slate-600">{num(item.ofd7).toLocaleString("en-IN")}</td>
                        <td className="p-3.5 text-center font-bold text-slate-500">{num(item.emo7).toFixed(1)}%</td>
                        <td className="p-3.5 text-center font-semibold text-slate-600">{num(item.ofd8).toLocaleString("en-IN")}</td>
                        <td className="p-3.5 text-center font-bold text-amber-600">{e8.toFixed(1)}%</td>
                        <td className="p-3.5 text-center font-semibold text-slate-600">{num(item.ofd9).toLocaleString("en-IN")}</td>
                        <td className="p-3.5 text-center font-bold text-slate-500">{num(item.emo9).toFixed(1)}%</td>
                        <td className="p-3.5 text-center font-semibold text-slate-600">{num(item.ofd10).toLocaleString("en-IN")}</td>
                        <td className="p-3.5 text-center font-bold text-emerald-600">{e10.toFixed(1)}%</td>
                        <td className="p-3.5 text-center font-semibold text-slate-600">{num(item.ofd12).toLocaleString("en-IN")}</td>
                        <td className="p-3.5 text-center font-bold text-blue-600">{e12.toFixed(1)}%</td>
                        <td className="p-3.5 text-center font-semibold text-slate-600">{num(item.ofd2).toLocaleString("en-IN")}</td>
                        <td className="p-3.5 text-center font-bold text-slate-600">{num(item.emo2).toFixed(1)}%</td>
                        <td className="p-3.5 text-center font-semibold text-slate-600">{num(item.ofd4).toLocaleString("en-IN")}</td>
                        <td className="p-3.5 text-center font-bold text-slate-600">{num(item.emo4).toFixed(1)}%</td>
                        <td className="p-3.5 text-center font-semibold text-slate-600">{num(item.ofdAfter4).toLocaleString("en-IN")}</td>
                        <td className="p-3.5 text-center font-black text-emerald-700">{num(item.emoAfter4, 100).toFixed(0)}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="mt-8 text-center text-xs text-slate-400 py-2">
        EMO HUB WISE • Sarfaraz Nawab Operations Span • Zero-Delay Local Cache Engine
      </footer>
    </div>
  );
}
