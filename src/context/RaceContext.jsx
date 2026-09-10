import { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import { isAuthError, writeFailureReason, writeErrorMessage } from '../lib/supabaseResult';
import { pushScanViaRpc } from '../lib/scanSync';
import { fetchAllRows } from '../lib/supabaseFetch';
import { normalizeScannedBib, smartFindRunner } from '../lib/bibUtils';

const RaceContext = createContext();

export const CHECKPOINTS = [
  {id:'A1', name:'A1 Mae Kha Nin'},
  {id:'A2', name:'A2 Doi Pha Daeng'},
  {id:'A3', name:'A3 Huai Nam Sai'},
];
export const CATEGORIES = ['MKT10','MKT25','PST50'];

const firstTH = ['สมชาย','วิภา','อนันต์','กมล','ธนพล','สุนิสา','ปรีชา','อรทัย','ณัฐพงษ์','จิราพร','เสริมศักดิ์','พิมพ์ชนก','วีระ','ศิริพร','ชัยวัฒน์','นภัสสร','ก้องภพ','อัญชลี','ภูมิ','ดวงใจ'];
const lastTH  = ['ใจดี','ทิพย์พันธ์','แสงทอง','บุญมา','ศรีสุข','คำมูล','วงศ์ใหญ่','จันทร์เพ็ญ','อินทะวงศ์','สุขสวัสดิ์','ทองดี','ปัญญาดี','แก้วมณี','พรมมา','ตันติกุล','ไชยวงศ์','มาลัย','สุริยะ','บัวคำ','ธาราทิพย์'];
const ageGroups = ['20-29','30-39','40-49','50-59'];

// Seed Data
function generateSeedData() {
  let runners = [];
  let scanLog = [];
  let n = 0;
  const plan=[{cat:'MKT10',base:1001,count:14},{cat:'MKT25',base:2001,count:12},{cat:'PST50',base:5001,count:12}];
  plan.forEach(p=>{
    for(let i=0;i<p.count;i++){
      const g = Math.random()<.6?'M':'F';
      runners.push({
        bib:String(p.base+i),
        name:firstTH[(n*7)%20]+' '+lastTH[(n*11)%20],
        gender:g, age:ageGroups[n%4], nat:'THAI', cat:p.cat,
        checkin:null, cps:{}, finish:null
      });
      n++;
    }
  });

  const now = Date.now();
  const rnd = (a, b) => a + Math.random() * (b - a);
  
  runners.forEach((r,i)=>{
    if(i%3!==0){ r.checkin = now - rnd(3.5,5)*3600e3; }
  });
  
  runners.filter(r=>r.checkin).forEach((r,i)=>{
    if(i%2===0){ r.cps['A1'] = r.checkin + rnd(.8,1.4)*3600e3; }
    if(i%4===0){ r.cps['A2'] = r.checkin + rnd(1.8,2.4)*3600e3; }
    if(i%5===0){ r.finish = r.checkin + rnd(2.6,4.2)*3600e3; }
  });

  // Seed log
  const cpName = (id) => { const c=CHECKPOINTS.find(c=>c.id===id); return c?c.name:id };
  runners.forEach(r=>{
    if(r.checkin) scanLog.push({time:r.checkin,station:'Check-in',bib:r.bib,name:r.name,ok:true});
    Object.entries(r.cps).forEach(([cp,t])=>scanLog.push({time:t,station:cpName(cp),bib:r.bib,name:r.name,ok:true}));
    if(r.finish) scanLog.push({time:r.finish,station:'Finish',bib:r.bib,name:r.name,ok:true});
  });
  scanLog.sort((a,b)=>b.time-a.time);

  return { runners, scanLog };
}

export function parseStartTime(startTimeStr, refTimestamp) {
  if (!startTimeStr) return null;
  if (!isNaN(startTimeStr) && typeof startTimeStr === 'number') return startTimeStr;
  if (String(startTimeStr).includes('-') || String(startTimeStr).includes('/')) {
    const d = new Date(startTimeStr);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  const parts = String(startTimeStr).trim().split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const baseDate = refTimestamp ? new Date(refTimestamp) : new Date();
    baseDate.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
    return baseDate.getTime();
  }
  return null;
}

export function RaceProvider({ children }) {
  const { session: authSession, staff: staffProfile } = useAuth();
  // Every server read and write is keyed on this: no session means no data.
  const sessionUserId = authSession?.user?.id || null;
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoryCheckpoints, setCategoryCheckpoints] = useState([]);
  const [runners, setRunners] = useState([]);
  const runnersRef = useRef(runners);
  runnersRef.current = runners;
  const [checkpoints, setCheckpoints] = useState(CHECKPOINTS);
  const [scanLog, setScanLog] = useState(() => {
    try {
      const saved = localStorage.getItem('trail_scan_log');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [stationClearedAt, setStationClearedAt] = useState(() => {
    try {
      const saved = localStorage.getItem('trail_station_cleared_at');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('trail_scan_log', JSON.stringify(scanLog.slice(0, 300)));
    } catch {}
  }, [scanLog]);

  const [loadingRunners, setLoadingRunners] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', resolve: null });

  const lastToastMsgRef = useRef('');
  const lastToastTimeRef = useRef(0);
  const addToast = useCallback((msg, err = false) => {
    const now = Date.now();
    if (err && lastToastMsgRef.current === msg && (now - lastToastTimeRef.current) < 1500) {
      return;
    }
    lastToastMsgRef.current = msg;
    lastToastTimeRef.current = now;
    setToastMsg({ msg, err, id: now });
    setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const clearStationScanLog = useCallback((stationKey) => {
    const now = Date.now();
    setStationClearedAt(prev => {
      const updated = { ...prev, [stationKey]: now };
      try {
        localStorage.setItem('trail_station_cleared_at', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setScanLog(prev => {
      const filtered = prev.filter(log => {
        const match = log.station === stationKey || log.stationId === stationKey;
        return !match;
      });
      try {
        localStorage.setItem('trail_scan_log', JSON.stringify(filtered.slice(0, 300)));
      } catch {}
      return filtered;
    });

    addToast(`ล้างประวัติการสแกนบนหน้าจอนี้เรียบร้อย (ข้อมูลใน Database ไม่ได้รับผลกระทบ)`, false);
  }, [addToast]);

  const syncRunnerScansToLog = useCallback((runnersList, currentStations, clearedMap = stationClearedAt) => {
    if (!runnersList || runnersList.length === 0) return;

    const getStationName = (stId) => {
      const found = currentStations?.find(s => s.id === stId);
      return found ? found.name : stId;
    };

    const newEntries = [];
    runnersList.forEach(r => {
      // 1. Check-in
      if (r.checkin) {
        const time = typeof r.checkin === 'number' ? r.checkin : new Date(r.checkin).getTime();
        const clearedTime = clearedMap['Check-in'] || 0;
        if (time > clearedTime) {
          newEntries.push({
            id: `db_checkin_${r.id || r.bib}`,
            time,
            station: 'Check-in',
            bib: r.bib,
            name: r.name,
            ok: true,
            operator: r.checked_in_by || 'Staff',
            isFromDb: true
          });
        }
      }

      // 2. Checkpoints
      if (r.cps && typeof r.cps === 'object') {
        Object.entries(r.cps).forEach(([cpId, cpTime]) => {
          if (!cpTime) return;
          const time = typeof cpTime === 'number' ? cpTime : new Date(cpTime).getTime();
          const stName = getStationName(cpId);
          const clearedTime = Math.max(clearedMap[stName] || 0, clearedMap[cpId] || 0);
          if (time > clearedTime) {
            newEntries.push({
              id: `db_cp_${cpId}_${r.id || r.bib}`,
              time,
              station: stName,
              stationId: cpId,
              bib: r.bib,
              name: r.name,
              ok: true,
              operator: 'Staff',
              isFromDb: true
            });
          }
        });
      }

      // 3. Finish
      if (r.finish) {
        const time = typeof r.finish === 'number' ? r.finish : new Date(r.finish).getTime();
        const clearedTime = clearedMap['Finish'] || 0;
        if (time > clearedTime) {
          newEntries.push({
            id: `db_finish_${r.id || r.bib}`,
            time,
            station: 'Finish',
            bib: r.bib,
            name: r.name,
            ok: true,
            operator: 'Staff',
            isFromDb: true
          });
        }
      }
    });

    if (newEntries.length === 0) return;

    setScanLog(prev => {
      const filteredPrev = prev.filter(item => {
        const clearedTime = Math.max(
          clearedMap[item.station] || 0,
          item.stationId ? (clearedMap[item.stationId] || 0) : 0
        );
        return (item.time || 0) > clearedTime;
      });

      const existingKeys = new Set(
        filteredPrev.map(item => `${item.bib}_${item.station}_${Math.floor((item.time || 0) / 1000)}`)
      );

      const toAdd = newEntries.filter(
        item => !existingKeys.has(`${item.bib}_${item.station}_${Math.floor((item.time || 0) / 1000)}`)
      );

      if (toAdd.length === 0 && filteredPrev.length === prev.length) return prev;

      const merged = [...filteredPrev, ...toAdd].sort((a, b) => (b.time || 0) - (a.time || 0));
      const sliced = merged.slice(0, 300);
      try {
        localStorage.setItem('trail_scan_log', JSON.stringify(sliced));
      } catch {}
      return sliced;
    });
  }, [stationClearedAt]);

  // ── Offline & Preload Data State ──
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [preloadStatusText, setPreloadStatusText] = useState('');
  const [lastSyncedTime, setLastSyncedTime] = useState(() => {
    const saved = localStorage.getItem('trail_last_synced_time');
    return saved ? parseInt(saved, 10) : null;
  });

  const [pendingSyncQueue, setPendingSyncQueue] = useState(() => {
    try {
      const saved = localStorage.getItem('trail_pending_sync_queue');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [currentlySyncingId, setCurrentlySyncingId] = useState(null);
  const isProcessingQueueRef = useRef(false);

  useEffect(() => {
    localStorage.setItem('trail_pending_sync_queue', JSON.stringify(pendingSyncQueue));
  }, [pendingSyncQueue]);

  useEffect(() => {
    if (lastSyncedTime) {
      localStorage.setItem('trail_last_synced_time', String(lastSyncedTime));
    }
  }, [lastSyncedTime]);

  const enqueueSyncItem = useCallback((item) => {
    setPendingSyncQueue(prev => {
      if (prev.some(p => p.id === item.id)) return prev;
      const updated = [...prev, item];
      localStorage.setItem('trail_pending_sync_queue', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Online / Offline Network Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast('🌐 เชื่อมต่ออินเทอร์เน็ตแล้ว — กำลังเริ่มซิงค์ข้อมูลในพื้นหลัง...', false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      addToast('⚠️ สัญญาณเน็ตขาดหาย — ระบบสลับเข้าโหมดออฟไลน์อัตโนมัติ (ยังสแกนได้ตามปกติ)', true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Staff & Scanner Operator State.
  //
  // The cache holds real rows fetched from the server and nothing else. There is
  // deliberately no default roster: invented staff are indistinguishable from a
  // seeded one on screen, so a race director would believe the setup step was
  // done, and editing a fabricated row (id '1', not a uuid) fails against the
  // real table. An empty list means "nobody has been seeded yet" — see
  // supabase/BOOTSTRAP_FIRST_ADMIN.sql.
  const [staffList, setStaffList] = useState(() => {
    try {
      const saved = localStorage.getItem('trail_staff_list');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('Cached staff list parse failed:', err);
      return [];
    }
  });

  // The operator is derived from the signed-in staff record — it is never typed
  // by the user, so nobody can sign a scan as somebody else. The last known value
  // stays cached in localStorage purely so the field UI still has a name to show
  // while offline; it is overwritten as soon as the session resolves.
  const [cachedOperator, setCachedOperator] = useState(() => {
    return localStorage.getItem('trail_current_operator') || '';
  });

  const sessionOperator = staffProfile?.name || authSession?.user?.email || '';
  const currentOperator = sessionOperator || cachedOperator;

  useEffect(() => {
    if (!sessionOperator) return;
    localStorage.setItem('trail_current_operator', sessionOperator);
    setCachedOperator(sessionOperator);
  }, [sessionOperator]);

  useEffect(() => {
    localStorage.setItem('trail_staff_list', JSON.stringify(staffList));
  }, [staffList]);

  // Demo data is for local development only. Seeding fake events or runners onto
  // a real device is worse than showing an error: a marshal cannot tell them from
  // the real start list.
  const loadSeedDataForDev = () => {
    if (!import.meta.env.DEV) return false;
    const seed = generateSeedData();
    setRunners(seed.runners);
    setScanLog(seed.scanLog);
    return true;
  };

  const applyCachedEvents = () => {
    const cached = localStorage.getItem('trail_cached_events');
    if (!cached) return false;
    try {
      const evs = JSON.parse(cached);
      if (!Array.isArray(evs) || evs.length === 0) return false;
      setEvents(evs);
      setSelectedEventId(prev => prev || evs[0].id);
      return true;
    } catch (err) {
      console.error('Cached events parse failed:', err);
      return false;
    }
  };

  // Events are fetched only once a session exists. Before sign-in every request is
  // rejected by RLS, and the previous version answered that rejection with seed
  // data — then never refetched, because the effect had an empty dependency array.
  // Keying on the session id makes the fetch run again the moment login succeeds.
  useEffect(() => {
    if (!sessionUserId) return undefined;
    let isActive = true;

    async function fetchEvents() {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, name')
          .order('start_date', { ascending: false });
        if (!isActive) return;

        if (error) {
          console.error('Fetch events failed:', error);
          if (isAuthError(error)) {
            if (!applyCachedEvents()) {
              addToast('ไม่มีสิทธิ์เข้าถึงข้อมูลงานวิ่ง กรุณาเข้าสู่ระบบใหม่อีกครั้ง', true);
            }
            return;
          }
          if (!applyCachedEvents() && !loadSeedDataForDev()) {
            addToast('โหลดรายการงานวิ่งไม่สำเร็จ และยังไม่มีข้อมูลในเครื่อง', true);
          }
          return;
        }

        if (data && data.length > 0) {
          setEvents(data);
          localStorage.setItem('trail_cached_events', JSON.stringify(data));
          setSelectedEventId(prev => prev || data[0].id);
          return;
        }

        // Authenticated but nothing visible: RLS answers a denied SELECT with an
        // empty list rather than an error, so this must not seed either.
        if (!applyCachedEvents()) {
          setEvents([]);
          addToast('ไม่พบงานวิ่งที่บัญชีนี้เข้าถึงได้ กรุณาติดต่อผู้ดูแลระบบ', true);
        }
      } catch (err) {
        console.error('Network error fetching events:', err);
        if (!isActive) return;
        if (!applyCachedEvents() && !loadSeedDataForDev()) {
          addToast('เชื่อมต่อฐานข้อมูลไม่ได้ และยังไม่มีข้อมูลงานวิ่งในเครื่อง', true);
        }
      }
    }

    fetchEvents();
    return () => {
      isActive = false;
    };
  }, [sessionUserId]);

  // Staff list, same session gating: without a session this returns nothing useful.
  useEffect(() => {
    if (!sessionUserId) return undefined;
    let isActive = true;

    async function fetchStaff() {
      try {
        const { data, error } = await supabase.from('staff').select('*').order('name', { ascending: true });
        if (!isActive) return;
        if (error) {
          console.error('Fetch staff failed:', error);
          return;
        }
        if (data && data.length > 0) {
          setStaffList(data);
          localStorage.setItem('trail_staff_list', JSON.stringify(data));
        }
      } catch (err) {
        console.error('Fetch staff failed:', err);
      }
    }

    fetchStaff();
    return () => {
      isActive = false;
    };
  }, [sessionUserId, selectedEventId]);

  // Pre-load all data into client memory and cache for ultra-fast offline scanning
  const preloadEventData = async (targetEventId = selectedEventId) => {
    if (!targetEventId) return;
    setIsPreloading(true);
    setPreloadProgress(10);
    setPreloadStatusText('กำลังเชื่อมต่อฐานข้อมูล...');

    try {
      // Step 1: Categories & Checkpoint Mapping
      setPreloadProgress(25);
      setPreloadStatusText('กำลังดาวน์โหลดระยะทางและเวลา Cutoff...');
      const { data: catData } = await supabase
        .from('categories')
        .select('*')
        .eq('event_id', targetEventId);

      const loadedCats = catData || [];
      setCategories(loadedCats);
      localStorage.setItem(`trail_cached_categories_${targetEventId}`, JSON.stringify(loadedCats));

      let mappedCheckpoints = [];
      if (loadedCats.length > 0) {
        const catIds = loadedCats.map(c => c.id).filter(Boolean);
        const { data: cpData } = await supabase
          .from('checkpoint')
          .select(`
            id, category_id, station_id, sequence_order, cutoff_time,
            stations ( name, type )
          `)
          .in('category_id', catIds);
        mappedCheckpoints = cpData || [];
        setCategoryCheckpoints(mappedCheckpoints);
      }

      const catMap = {};
      loadedCats.forEach(c => {
        const catCheckpoints = mappedCheckpoints
          .filter(cp => cp.category_id === c.id)
          .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));

        const catStations = catCheckpoints
          .map(cp => {
            const st = Array.isArray(cp.stations) ? cp.stations[0] : cp.stations;
            return {
              id: cp.station_id || st?.id,
              name: st?.name || `Checkpoint ${cp.sequence_order}`,
              type: st?.type || 'CP',
              sequence_order: cp.sequence_order,
              cutoff_time: cp.cutoff_time
            };
          })
          .filter(st => st.type !== 'START' && st.type !== 'FINISH' && !/start|ปล่อยตัว|finish|เส้นชัย/i.test(st.name || ''));

        const startCp = mappedCheckpoints.find(cp => 
          cp.category_id === c.id && (cp.stations?.type === 'START' || cp.sequence_order === 1) && cp.cutoff_time
        );
        const effectiveStartTime = startCp?.cutoff_time || c.start_time || null;
        const catObj = { ...c, start_time: effectiveStartTime, stations: catStations, checkpoints: catCheckpoints };
        if (c.name) catMap[c.name] = catObj;
        if (c.id) catMap[c.id] = catObj;
      });

      // Step 2: Stations
      setPreloadProgress(50);
      setPreloadStatusText('กำลังดาวน์โหลดจุดตรวจ (Stations)...');
      const { data: sData } = await supabase
        .from('stations')
        .select('*')
        .eq('event_id', targetEventId)
        .order('sequence_order', { ascending: true });

      if (sData && sData.length > 0) {
        const mappedStations = sData.map(s => ({ id: s.id, name: s.name, type: s.type }));
        setCheckpoints(mappedStations);
        localStorage.setItem(`trail_cached_stations_${targetEventId}`, JSON.stringify(mappedStations));
      }

      // Step 3: Runners
      setPreloadProgress(75);
      setPreloadStatusText('กำลังดาวน์โหลดรายชื่อนักวิ่งทั้งหมด...');
      const { data: rData, error: rError } = await fetchAllRows((from, to) =>
        supabase
          .from('runners')
          .select('*')
          .eq('event_id', targetEventId)
          .order('id', { ascending: true })
          .range(from, to)
      );

      if (!rError && rData) {
        const formatted = rData.map(r => {
          const cat = r.cat || r.cat_name || (r.distance != null && r.unit ? `${r.distance}${r.unit}` : (r.distance != null ? String(r.distance) : ''));
          const matchedCat = (cat ? catMap[cat] : null) || (r.category_id ? catMap[r.category_id] : null);
          const checkinTime = r.checkin || (r.checked_in_at ? new Date(r.checked_in_at).getTime() : null);
          const gunStartTime = matchedCat?.start_time ? parseStartTime(matchedCat.start_time, null) : null;

          return {
            ...r,
            bib: r.bib || '',
            name: r.name || '',
            gender: r.gender || '',
            cat: cat,
            age: r.age || '',
            nat: r.nat || '',
            checkin: checkinTime,
            gunStartTime: gunStartTime || r.gun_start_time || r.start_time || null,
            categoryStartTimeStr: matchedCat?.start_time ? (matchedCat.start_time.includes('T') ? new Date(matchedCat.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : matchedCat.start_time) : null,
            categoryStations: matchedCat?.stations || [],
            categoryCheckpoints: matchedCat?.checkpoints || [],
            cps: r.cps || {},
            finish: r.finish || null
          };
        });

        setRunners(formatted);
        localStorage.setItem(`trail_cached_runners_${targetEventId}`, JSON.stringify(formatted));
      }

      // Step 4: Finalize & Cache Staff
      setPreloadProgress(90);
      setPreloadStatusText('กำลังบันทึกลงหน่วยความจำแคช...');
      const now = Date.now();
      setLastSyncedTime(now);
      localStorage.setItem(`trail_cached_synced_${targetEventId}`, String(now));

      setPreloadProgress(100);
      setPreloadStatusText(`✓ เตรียมข้อมูลนักวิ่ง ${rData?.length || 0} คน สำเร็จ! พร้อมสแกนออฟไลน์`);
      addToast(`⚡ เตรียมข้อมูลนักวิ่ง ${rData?.length || 0} คน สำเร็จ! สแกนได้ทันทีโดยไม่ต้องต่อเน็ต`, false);

      setTimeout(() => {
        setIsPreloading(false);
      }, 2000);
    } catch (err) {
      console.error('Preload error:', err);
      // Try loading from existing cache
      const cachedRunners = localStorage.getItem(`trail_cached_runners_${targetEventId}`);
      if (cachedRunners) {
        const parsed = JSON.parse(cachedRunners);
        setRunners(parsed);
        setPreloadProgress(100);
        setPreloadStatusText(`⚡ โหลดจากแคชเดิม ${parsed.length} คน (โหมดออฟไลน์)`);
        addToast(`⚡ โหลดจากแคชเดิม ${parsed.length} คน (พร้อมใช้งานออฟไลน์)`, false);
      } else {
        setPreloadStatusText('⚠️ ไม่สามารถเชื่อมต่อได้ และยังไม่มีแคชในเครื่อง');
        addToast('ไม่สามารถดาวน์โหลดข้อมูลได้ โปรดตรวจสอบสัญญาณเน็ต', true);
      }
      setTimeout(() => setIsPreloading(false), 3000);
    }
  };

  // ── Background Queue Worker (Non-blocking Asynchronous Synchronization) ──
  const processNextInQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || !navigator.onLine) return;

    let currentQueue = [];
    try {
      const saved = localStorage.getItem('trail_pending_sync_queue');
      currentQueue = saved ? JSON.parse(saved) : [];
    } catch {
      currentQueue = [];
    }

    if (currentQueue.length === 0) {
      setIsSyncingQueue(false);
      return;
    }

    isProcessingQueueRef.current = true;
    setIsSyncingQueue(true);

    try {
      const item = currentQueue[0];
      setCurrentlySyncingId(item.id);
      let uploadSuccess = false;

      try {
        const { reason, data: authoritative } = await pushScanViaRpc(item);
        uploadSuccess = !reason;
        if (reason) {
          console.warn('Background sync error:', reason);
        } else if (authoritative && item.runnerId) {
          // Self-heal this device's cache with the server's authoritative
          // state — this is what corrects a stale local cps/finish/
          // checked_in_at snapshot after every successful sync, instead of
          // adding a realtime subscription to the scan pages.
          setRunners(prev => {
            const next = prev.map(r =>
              r.id === item.runnerId ? { ...r, ...authoritative } : r
            );
            runnersRef.current = next;
            return next;
          });
        }
      } catch (err) {
        console.warn('Network error during background sync item:', err);
        uploadSuccess = false;
      }

      if (uploadSuccess) {
        setPendingSyncQueue(prev => {
          const nextQ = prev.filter(q => q.id !== item.id);
          localStorage.setItem('trail_pending_sync_queue', JSON.stringify(nextQ));
          return nextQ;
        });
      } else {
        const attempts = (item.attempts || 0) + 1;
        const MAX_ATTEMPTS_BEFORE_REQUEUE = 5;
        const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 20;

        if (attempts >= MAX_ATTEMPTS_BEFORE_DEAD_LETTER) {
          // Give up retrying this item forever — park it somewhere visible
          // instead of blocking the queue indefinitely. Write the dead-letter
          // record FIRST, and only remove the item from the pending queue if
          // that write actually succeeded: a localStorage failure here
          // (corrupted JSON, quota exceeded after days of racing) must not
          // make the item vanish from both places at once — that would be
          // exactly the silent data loss this whole fix exists to close.
          let deadLetterWriteOk = true;
          try {
            const dead = JSON.parse(localStorage.getItem('trail_dead_letter_queue') || '[]');
            localStorage.setItem('trail_dead_letter_queue', JSON.stringify([...dead, { ...item, attempts }]));
          } catch (err) {
            deadLetterWriteOk = false;
            console.warn('Dead-letter write failed, keeping item in pending queue:', err);
          }

          if (deadLetterWriteOk) {
            setPendingSyncQueue(prev => {
              const nextQ = prev.filter(q => q.id !== item.id);
              localStorage.setItem('trail_pending_sync_queue', JSON.stringify(nextQ));
              return nextQ;
            });
            addToast(`⚠️ ส่งข้อมูล BIB ${item.bib} ไม่สำเร็จหลังลองซ้ำหลายครั้ง — ต้องแก้ไขด้วยตนเอง`, true);
          } else {
            // Dead-letter storage itself is broken — do not drop the item.
            // Requeue it at the back with its attempt count intact so it
            // keeps retrying (and keeps trying to dead-letter) instead of
            // disappearing.
            const updatedItem = { ...item, attempts };
            setPendingSyncQueue(prev => {
              const rest = prev.filter(q => q.id !== item.id);
              const nextQ = [...rest, updatedItem];
              localStorage.setItem('trail_pending_sync_queue', JSON.stringify(nextQ));
              return nextQ;
            });
            addToast(`⚠️ บันทึกรายการที่ส่งไม่สำเร็จไม่ได้ (พื้นที่จัดเก็บเต็ม?) — ยังคงพยายามส่งต่อ`, true);
          }
        } else {
          const updatedItem = { ...item, attempts };
          setPendingSyncQueue(prev => {
            const rest = prev.filter(q => q.id !== item.id);
            // After enough failed attempts, stop blocking the head of the
            // queue — move this item to the back so scans behind it keep
            // syncing instead of waiting on a poison item forever.
            const nextQ = attempts >= MAX_ATTEMPTS_BEFORE_REQUEUE
              ? [...rest, updatedItem]
              : [updatedItem, ...rest];
            localStorage.setItem('trail_pending_sync_queue', JSON.stringify(nextQ));
            return nextQ;
          });
          // Exponential backoff, capped at 30s, instead of a flat 2.5s hammer.
          const backoffMs = Math.min(2500 * 2 ** (attempts - 1), 30000);
          await new Promise(r => setTimeout(r, backoffMs));
        }
      }
    } finally {
      setCurrentlySyncingId(null);
      isProcessingQueueRef.current = false;
      // Trigger next item with slight delay (40ms) to ensure UI thread remains buttery smooth
      setTimeout(() => {
        let remaining = [];
        try {
          const s = localStorage.getItem('trail_pending_sync_queue');
          remaining = s ? JSON.parse(s) : [];
        } catch {
          remaining = [];
        }
        if (remaining.length > 0 && navigator.onLine) {
          processNextInQueue();
        } else {
          setIsSyncingQueue(false);
        }
      }, 40);
    }
  }, []);

  const syncPendingQueue = async () => {
    if (pendingSyncQueue.length === 0) {
      addToast('ไม่มีข้อมูลค้างส่ง ข้อมูลเป็นปัจจุบันแล้ว ✓', false);
      return;
    }
    if (!navigator.onLine) {
      addToast('⚠️ อุปกรณ์อยู่ในโหมดออฟไลน์ ไม่สามารถเชื่อมต่อเน็ตได้', true);
      return;
    }
    addToast('🔄 กำลังส่งข้อมูลขึ้นคลาวด์ในพื้นหลัง...', false);
    processNextInQueue();
  };

  // Auto trigger background sync when items are queued or online status becomes available
  useEffect(() => {
    if (pendingSyncQueue.length > 0 && isOnline) {
      processNextInQueue();
    }
  }, [pendingSyncQueue.length, isOnline, processNextInQueue]);

  // Periodic heartbeat watchdog (every 4 seconds) to ensure all pending items are sent
  useEffect(() => {
    const timer = setInterval(() => {
      if (navigator.onLine && !isProcessingQueueRef.current) {
        let q = [];
        try {
          const s = localStorage.getItem('trail_pending_sync_queue');
          q = s ? JSON.parse(s) : [];
        } catch {}
        if (q.length > 0) {
          processNextInQueue();
        }
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [processNextInQueue]);

  // Deliberate, irreversible data loss — the escape hatch for a queue that can
  // never sync (deleted runner row, an operator RLS permanently refuses, a stale
  // id), which would otherwise pin the device to one signed-in operator forever.
  // Callers MUST have an explicit operator confirmation and MUST log what they
  // are dropping first; see SignOutButton.
  const clearPendingSyncQueue = useCallback(() => {
    setPendingSyncQueue([]);
  }, []);

  // Auto load cached data on selectedEventId change if available
  useEffect(() => {
    if (!selectedEventId) return;

    // Load from cache first for instant 0ms UI rendering
    const cachedRunners = localStorage.getItem(`trail_cached_runners_${selectedEventId}`);
    if (cachedRunners) {
      try {
        const parsed = JSON.parse(cachedRunners);
        setRunners(parsed);
        syncRunnerScansToLog(parsed, checkpoints);
      } catch (e) {
        console.warn('Cache parse error:', e);
      }
    }

    const cachedStations = localStorage.getItem(`trail_cached_stations_${selectedEventId}`);
    if (cachedStations) {
      try {
        const parsedSt = JSON.parse(cachedStations);
        setCheckpoints(parsedSt);
        if (cachedRunners) {
          try {
            syncRunnerScansToLog(JSON.parse(cachedRunners), parsedSt);
          } catch {}
        }
      } catch (err) {
        console.error('Cached stations parse error:', err);
      }
    }

    // Then perform normal background fetch
    async function fetchEventData() {
      setLoadingRunners(true);
      try {
        // 1. Fetch Categories
        const { data: catData, error: catError } = await supabase
          .from('categories')
          .select('*')
          .eq('event_id', selectedEventId);

        const loadedCats = (!catError && catData) ? catData : [];
        setCategories(loadedCats);

        // 1.1 Fetch Checkpoints mapped to categories for Start Gun Time
        let mappedCheckpoints = [];
        if (loadedCats.length > 0) {
          const catIds = loadedCats.map(c => c.id).filter(Boolean);
          const { data: cpData } = await supabase
            .from('checkpoint')
            .select(`
              id, category_id, station_id, sequence_order, cutoff_time,
              stations ( name, type )
            `)
            .in('category_id', catIds);
          mappedCheckpoints = cpData || [];
          setCategoryCheckpoints(mappedCheckpoints);
        }

        const catMap = {};
        loadedCats.forEach(c => {
          const startCp = mappedCheckpoints.find(cp => 
            cp.category_id === c.id && (cp.stations?.type === 'START' || cp.sequence_order === 1) && cp.cutoff_time
          );
          const effectiveStartTime = startCp?.cutoff_time || c.start_time || null;
          const catObj = { ...c, start_time: effectiveStartTime };

          if (c.name) catMap[c.name] = catObj;
          if (c.id) catMap[c.id] = catObj;
        });

        // 2. Fetch Runners
        const { data: rData, error: rError } = await fetchAllRows((from, to) =>
          supabase
            .from('runners')
            .select('*')
            .eq('event_id', selectedEventId)
            .order('id', { ascending: true })
            .range(from, to)
        );

        let latestRunners = [];
        if (!rError && rData) {
          const formatted = rData.map(r => {
            const cat = r.cat || r.cat_name || (r.distance != null && r.unit ? `${r.distance}${r.unit}` : (r.distance != null ? String(r.distance) : ''));
            const matchedCat = (cat ? catMap[cat] : null) || (r.category_id ? catMap[r.category_id] : null);
            const checkinTime = r.checkin || (r.checked_in_at ? new Date(r.checked_in_at).getTime() : null);
            const gunStartTime = matchedCat?.start_time ? parseStartTime(matchedCat.start_time, null) : null;

            return {
              ...r,
              bib: r.bib || '',
              name: r.name || '',
              gender: r.gender || '',
              cat: cat,
              age: r.age || '',
              nat: r.nat || '',
              checkin: checkinTime,
              gunStartTime: gunStartTime || r.gun_start_time || r.start_time || null,
              categoryStartTimeStr: matchedCat?.start_time ? (matchedCat.start_time.includes('T') ? new Date(matchedCat.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : matchedCat.start_time) : null,
              cps: r.cps || {},
              finish: r.finish || null
            };
          });
          latestRunners = formatted;
          setRunners(formatted);
          localStorage.setItem(`trail_cached_runners_${selectedEventId}`, JSON.stringify(formatted));
          setLastSyncedTime(Date.now());
          syncRunnerScansToLog(formatted, checkpoints);
        }

        // 3. Fetch Stations/Checkpoints
        const { data: sData, error: sError } = await supabase
          .from('stations')
          .select('*')
          .eq('event_id', selectedEventId)
          .order('sequence_order', { ascending: true });

        if (!sError && sData && sData.length > 0) {
          const mappedStations = sData.map(s => ({ id: s.id, name: s.name, type: s.type }));
          setCheckpoints(mappedStations);
          localStorage.setItem(`trail_cached_stations_${selectedEventId}`, JSON.stringify(mappedStations));
          if (latestRunners.length > 0) {
            syncRunnerScansToLog(latestRunners, mappedStations);
          }
        }
      } catch (err) {
        console.warn('Background fetch error, using client cache:', err);
      } finally {
        setLoadingRunners(false);
      }
    }
    fetchEventData();
  }, [selectedEventId, syncRunnerScansToLog]);

  const showConfirm = useCallback((title, message) => {
    return new Promise((resolve) => {
      setConfirmConfig({
        isOpen: true,
        title,
        message,
        resolve
      });
    });
  }, []);

  const handleConfirm = () => {
    if (confirmConfig.resolve) confirmConfig.resolve(true);
    setConfirmConfig({ ...confirmConfig, isOpen: false });
  };

  const handleCancel = () => {
    if (confirmConfig.resolve) confirmConfig.resolve(false);
    setConfirmConfig({ ...confirmConfig, isOpen: false });
  };

  const getCpName = (id) => {
    if (!id) return 'CheckPoint';
    const c = checkpoints.find(c => c.id === id || c.name === id);
    return c ? c.name : id;
  };

  const findRunner = (bib) => smartFindRunner(bib, runnersRef.current || runners);

  const addLog = (entry) => {
    setScanLog(prev => {
      // Prevent flood of duplicate error logs if exact same failed BIB was logged within 2 seconds
      if (!entry.ok && prev.length > 0) {
        const last = prev[0];
        if (!last.ok && String(last.bib).trim() === String(entry.bib).trim() && Math.abs((entry.time || 0) - (last.time || 0)) < 2000) {
          return prev;
        }
      }
      return [entry, ...prev].slice(0, 300);
    });
  };

  const updateRunner = (updatedRunner) => {
    setRunners(prev => {
      const next = prev.map(r => (String(r.bib).trim() === String(updatedRunner.bib).trim() || (updatedRunner.id && r.id === updatedRunner.id)) ? { ...r, ...updatedRunner } : r);
      runnersRef.current = next;
      if (selectedEventId) {
        try {
          localStorage.setItem(`trail_cached_runners_${selectedEventId}`, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  // Adding a staff record never switches the current operator: the operator
  // always comes from the signed-in session.
  const addStaff = async (name, role = 'MARSHAL') => {
    if (!name || !name.trim()) return null;
    const trimmed = name.trim();

    try {
      const result = await supabase
        .from('staff')
        .insert([{ name: trimmed, role, status: 'ACTIVE', event_id: selectedEventId || null }])
        .select('*')
        .single();

      const failureReason = writeFailureReason(result);
      if (failureReason) {
        console.error('Staff insert rejected:', result.error);
        addToast(`เพิ่มเจ้าหน้าที่ "${trimmed}" ไม่สำเร็จ: ${failureReason}`, true);
        return null;
      }

      // Only mirror into local state once the database has the row.
      setStaffList(prev => [...prev, result.data]);
      addToast(`เพิ่มเจ้าหน้าที่ "${trimmed}" เรียบร้อยแล้ว`);
      return result.data;
    } catch (err) {
      console.error('Staff insert error:', err);
      addToast(`เกิดข้อผิดพลาด: ${err.message}`, true);
      return null;
    }
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // Core Scanner Engine (CheckPoint / Finish / Check-in)
  // ═════════════════════════════════════════════════════════════════════════════

  const formatDuration = (ms) => {
    if (!ms || ms < 0) return '00:00:00';
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${ss}`;
  };

  const processScan = (stationType, bib, stationId = null, preResolvedRunner = null) => {
    const now = Date.now();
    const operator = currentOperator || 'Staff';
    try {
      const currentRunners = runnersRef.current || runners || [];
      const cleanBib = normalizeScannedBib(bib) || String(bib || '').trim();
      const r = preResolvedRunner 
        || findRunner(bib) 
        || (cleanBib ? findRunner(cleanBib) : null)
        || smartFindRunner(bib, currentRunners)
        || (cleanBib ? smartFindRunner(cleanBib, currentRunners) : null);
      let result = { 
        success: false, 
        runner: r, 
        now, 
        firstTime: null, 
        totalTime: '', 
        isRescan: false, 
        message: '', 
        stationName: '', 
        operator 
      };

      if (!r) {
        addLog({ time: now, station: stationType === 'CheckPoint' ? getCpName(stationId) : stationType, bib: cleanBib || '—', name: 'ไม่พบในระบบ', ok: false, operator });
        addToast(`ไม่พบ BIB ${cleanBib || '—'} ในฐานข้อมูลงานนี้`, true);
        result.message = 'NOT FOUND · ไม่พบในระบบ';
        return result;
      }

    if (stationType === 'Check-in') {
      result.stationName = 'Check-in';
      const syncId = 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      const isAlreadyCheckedIn = r.registration_status === 'CHECKED_IN' || Boolean(r.checked_in_at) || Boolean(r.checkin && r.registration_status !== 'PRE_REGISTERED');

      if (isAlreadyCheckedIn) {
        // ── สแกนซ้ำ: สแกนไม่ได้ครั้งต่อไป แต่เก็บ Log ปกติ และยึดเวลาแรกเสมอ ──
        const firstTime = typeof r.checkin === 'number' ? r.checkin : (r.checked_in_at ? new Date(r.checked_in_at).getTime() : now);
        const dFirst = new Date(firstTime);
        const firstTimeStr = dFirst.toTimeString().slice(0, 8);

        result.success = false; // สแกนได้ครั้งเดียว ครั้งต่อไปสแกนไม่ได้
        result.isRescan = true;
        result.runner = r; // ยึดเวลาแรกเสมอ
        result.firstTime = firstTime;
        result.message = `Check in แล้ว : ${firstTimeStr} (ยึดเวลาแรก)`;

        addToast(`⚠️ BIB ${r.bib} ${r.name} เคย Check-in แล้ว (เวลาแรก ${firstTimeStr})`, true);
        addLog({ 
          time: now, 
          station: 'Check-in', 
          bib: r.bib, 
          name: r.name, 
          ok: false, 
          isRescan: true, 
          operator, 
          syncId, 
          msg: `สแกนซ้ำ (เวลาแรก ${firstTimeStr})` 
        });

        // ส่งเข้า log Database ตามปกติ แต่ไม่เขียนทับ checked_in_at เดิม
        if (r.id) {
          enqueueSyncItem({
            id: syncId,
            type: 'CHECKIN',
            isRescan: true,
            runnerId: r.id,
            bib: r.bib,
            time: now,
            firstTime,
            operator,
            note: 'CHECKIN_RESCAN'
          });
        }
      } else {
        // ── สแกนครั้งแรก ──
        const firstTime = now;
        const d = new Date(firstTime);
        const firstTimeStr = d.toTimeString().slice(0, 8);
        const updated = { ...r, checkin: firstTime, registration_status: 'CHECKED_IN', checked_in_by: operator };
        updateRunner(updated);

        result.success = true;
        result.isRescan = false;
        result.runner = updated;
        result.firstTime = firstTime;
        result.message = `Check in : ${firstTimeStr}`;

        addToast(`✓ Check-in สำเร็จ — BIB ${r.bib} ${r.name}`);
        addLog({ time: now, station: 'Check-in', bib: r.bib, name: r.name, ok: true, isRescan: false, operator, syncId });

        if (r.id) {
          enqueueSyncItem({
            id: syncId,
            type: 'CHECKIN',
            isRescan: false,
            runnerId: r.id,
            bib: r.bib,
            time: firstTime,
            operator
          });
        }
      }
    } 
    else if (stationType === 'CheckPoint') {
      const cpName = getCpName(stationId);
      result.stationName = cpName;
      const syncId = 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      
      // ตรวจสอบว่าเคยสแกนจุดนี้แล้วหรือไม่ (รองรับทั้ง stationId และ cpName จาก database)
      const existingCpTime = r.cps && (r.cps[stationId] != null ? r.cps[stationId] : (r.cps[cpName] != null ? r.cps[cpName] : null));

      if (existingCpTime != null) {
        // ── สแกนซ้ำที่จุดตรวจ: สแกนไม่ได้ครั้งต่อไป แต่เก็บ Log ปกติ และยึดเวลาแรกเสมอ ──
        const firstTime = typeof existingCpTime === 'number' ? existingCpTime : new Date(existingCpTime).getTime();
        const dFirst = new Date(firstTime);
        const firstTimeStr = dFirst.toTimeString().slice(0, 8);

        result.success = false; // สแกนได้ครั้งเดียว ครั้งต่อไปสแกนไม่ได้
        result.isRescan = true;
        result.runner = r; // ยึดเวลาแรกเสมอ
        result.firstTime = firstTime;
        result.message = `ผ่าน ${cpName} แล้ว : ${firstTimeStr} (ยึดเวลาแรก)`;

        addToast(`⚠️ BIB ${r.bib} ${r.name} เคยผ่าน ${cpName} แล้ว (เวลาแรก ${firstTimeStr})`, true);
        addLog({ 
          time: now, 
          station: cpName, 
          stationId, 
          bib: r.bib, 
          name: r.name, 
          ok: false, 
          isRescan: true, 
          operator, 
          syncId, 
          msg: `สแกนซ้ำ (เวลาแรก ${firstTimeStr})` 
        });

        // ส่งเข้า log Database ตามปกติ แต่ไม่เขียนทับ cps เดิม
        if (r.id) {
          enqueueSyncItem({
            id: syncId,
            type: 'CP',
            isRescan: true,
            runnerId: r.id,
            bib: r.bib,
            stationId,
            time: now,
            firstTime,
            operator,
            note: 'CP_RESCAN'
          });
        }
      } else {
        // ── สแกนผ่านจุดตรวจครั้งแรก ──
        // ไม่อิงลำดับขั้น: สแกนได้ทันทีโดยไม่ต้องผ่านจุดก่อนหน้าหรือ Check-in ก่อน
        const firstTime = now;
        const d = new Date(firstTime);
        const firstTimeStr = d.toTimeString().slice(0, 8);
        const updated = { ...r, cps: { ...(r.cps || {}), [stationId]: firstTime } };
        updateRunner(updated);

        result.success = true;
        result.isRescan = false;
        result.runner = updated;
        result.firstTime = firstTime;
        result.message = `Pass ${cpName} : ${firstTimeStr}`;

        addToast(`✓ ${cpName} — BIB ${r.bib} ${r.name}`);
        addLog({ time: now, station: cpName, stationId, bib: r.bib, name: r.name, ok: true, isRescan: false, operator, syncId });

        if (r.id) {
          enqueueSyncItem({
            id: syncId,
            type: 'CP',
            isRescan: false,
            runnerId: r.id,
            bib: r.bib,
            stationId,
            time: firstTime,
            operator
          });
        }
      }
    }
    else if (stationType === 'Finish') {
      result.stationName = 'Finish';
      const syncId = 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      // ไม่อิงลำดับขั้น: สแกนเส้นชัยได้ทันที
      // คำนวณเวลาวิ่ง Total Time:
      // ต้องคำนวณจาก Finish Time - Race Start Time (เวลาปล่อยตัว)
      // 1. Chip Start ใน r.cps (สถานี START)
      // 2. Official Gun Start Time / r.gunStartTime
      // 3. Category Start Time / r.start_time
      let raceStartTime = null;
      if (r.cps && typeof r.cps === 'object') {
        const startStationIds = new Set(
          checkpoints
            .filter(s => s.type === 'START' || /start|ปล่อยตัว/i.test(s.name || ''))
            .map(s => s.id)
        );
        for (const [key, val] of Object.entries(r.cps)) {
          if (startStationIds.has(key) || /start|ปล่อยตัว/i.test(String(key))) {
            const ep = typeof val === 'number' ? val : new Date(val).getTime();
            if (!isNaN(ep)) { raceStartTime = ep; break; }
          }
        }
      }
      if (!raceStartTime && r.gunStartTime) {
        const ep = typeof r.gunStartTime === 'number' ? r.gunStartTime : new Date(r.gunStartTime).getTime();
        if (!isNaN(ep)) raceStartTime = ep;
      }
      if (!raceStartTime && (r.gun_start_time || r.start_time)) {
        const ep = new Date(r.gun_start_time || r.start_time).getTime();
        if (!isNaN(ep)) raceStartTime = ep;
      }

      if (r.finish) {
        // ── สแกนเข้าเส้นชัยซ้ำ: สแกนไม่ได้ครั้งต่อไป แต่เก็บ Log ปกติ และยึดเวลาแรกเสมอ ──
        const firstTime = typeof r.finish === 'number' ? r.finish : new Date(r.finish).getTime();
        const totalTime = (raceStartTime && firstTime > raceStartTime) ? formatDuration(firstTime - raceStartTime) : '—';
        const dFirst = new Date(firstTime);
        const firstTimeStr = dFirst.toTimeString().slice(0, 8);

        result.success = false; // สแกนได้ครั้งเดียว ครั้งต่อไปสแกนไม่ได้
        result.isRescan = true;
        result.runner = r; // ยึดเวลาแรกเสมอ
        result.firstTime = firstTime;
        result.totalTime = totalTime;
        result.message = totalTime !== '—' ? `เข้าเส้นชัยแล้ว : Total ${totalTime} (ยึดเวลาแรก)` : `เข้าเส้นชัยแล้ว : ${firstTimeStr} (ยึดเวลาแรก)`;

        addToast(`⚠️ BIB ${r.bib} ${r.name} เคยเข้าเส้นชัยแล้ว (เวลาแรก${totalTime !== '—' ? ` Total: ${totalTime}` : ''})`, true);
        addLog({ 
          time: now, 
          station: 'Finish', 
          bib: r.bib, 
          name: r.name, 
          ok: false, 
          isRescan: true, 
          operator, 
          syncId, 
          msg: `สแกนซ้ำ (ยึดเวลาแรก${totalTime !== '—' ? ` Total: ${totalTime}` : ''})` 
        });

        // ส่งเข้า log Database ตามปกติ แต่ไม่เขียนทับ finish เดิม
        if (r.id) {
          enqueueSyncItem({
            id: syncId,
            type: 'FINISH',
            isRescan: true,
            runnerId: r.id,
            bib: r.bib,
            time: now,
            firstTime,
            operator,
            note: 'FINISH_RESCAN'
          });
        }
      } else {
        // ── สแกนเข้าเส้นชัยครั้งแรก ──
        const firstTime = now;
        const totalTime = (raceStartTime && firstTime > raceStartTime) ? formatDuration(firstTime - raceStartTime) : '—';
        const updated = { ...r, finish: firstTime };
        updateRunner(updated);

        result.success = true;
        result.isRescan = false;
        result.runner = updated;
        result.firstTime = firstTime;
        result.totalTime = totalTime;
        result.message = totalTime !== '—' ? `Total Time ${totalTime}` : `Finish : ${new Date(firstTime).toTimeString().slice(0, 8)}`;

        addToast(`🏁 Finish! BIB ${r.bib} ${r.name}${totalTime !== '—' ? ` (${totalTime})` : ''}`);
        addLog({ time: now, station: 'Finish', bib: r.bib, name: r.name, ok: true, isRescan: false, operator, syncId });

        if (r.id) {
          enqueueSyncItem({
            id: syncId,
            type: 'FINISH',
            isRescan: false,
            runnerId: r.id,
            bib: r.bib,
            time: firstTime,
            operator
          });
        }
      }
    }

      return result;
    } catch (scanErr) {
      console.error('Fatal scan error caught in processScan:', scanErr);
      return {
        success: false,
        runner: null,
        now,
        firstTime: null,
        totalTime: '',
        isRescan: false,
        message: 'Scan error · เกิดข้อผิดพลาดในการสแกน',
        stationName: '',
        operator
      };
    }
  };

  const importRunners = (newRunners) => {
    setRunners(prev => [...prev, ...newRunners]);
    addToast(`✓ นำเข้าข้อมูลสำเร็จ ${newRunners.length} รายการ`);
  };

  const assignNewBibs = (assignments) => {
    setRunners(prev => {
      const assignmentMap = new Map(assignments.map(a => [a.oldBib, a.newBib]));
      return prev.map(r => {
        if (assignmentMap.has(r.bib)) {
          return { ...r, bib: assignmentMap.get(r.bib) };
        }
        return r;
      });
    });
    addToast(`✓ อัพเดตหมายเลข BIB ใหม่ ${assignments.length} รายการ`);
  };

  return (
    <RaceContext.Provider value={{
      events,
      selectedEventId,
      setSelectedEventId,
      categories,
      categoryCheckpoints,
      checkpoints,
      loadingRunners,
      runners,
      scanLog,
      clearStationScanLog,
      staffList,
      currentOperator,
      currentStaff: staffProfile,
      addStaff,
      toastMsg,
      processScan,
      findRunner,
      normalizeScannedBib,
      addToast,
      showConfirm,
      getCpName,
      importRunners,
      updateRunner,
      assignNewBibs,
      // Offline & Preload Cache & Background Sync API
      isOnline,
      isPreloading,
      preloadProgress,
      preloadStatusText,
      lastSyncedTime,
      pendingSyncQueue,
      isSyncingQueue,
      currentlySyncingId,
      preloadEventData,
      syncPendingQueue,
      clearPendingSyncQueue
    }}>
      {children}
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </RaceContext.Provider>
  );
}

export const useRace = () => useContext(RaceContext);

