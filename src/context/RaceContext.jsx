import { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import { isAuthError, writeFailureReason, writeErrorMessage } from '../lib/supabaseResult';

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
  const [runners, setRunners] = useState([]);
  const [checkpoints, setCheckpoints] = useState(CHECKPOINTS);
  const [scanLog, setScanLog] = useState([]);
  const [loadingRunners, setLoadingRunners] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', resolve: null });

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
      const { data: rData, error: rError } = await supabase
        .from('runners')
        .select('*')
        .eq('event_id', targetEventId);

      if (!rError && rData) {
        const formatted = rData.map(r => {
          const matchedCat = catMap[r.cat] || (r.category_id ? catMap[r.category_id] : null);
          const checkinTime = r.checkin || (r.checked_in_at ? new Date(r.checked_in_at).getTime() : null);
          const gunStartTime = matchedCat?.start_time ? parseStartTime(matchedCat.start_time, checkinTime) : null;

          return {
            ...r,
            bib: r.bib || '',
            name: r.name || '',
            gender: r.gender || '',
            cat: r.cat || '',
            age: r.age || '',
            nat: r.nat || '',
            checkin: checkinTime,
            gunStartTime: gunStartTime,
            categoryStartTimeStr: matchedCat?.start_time ? (matchedCat.start_time.includes('T') ? new Date(matchedCat.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : matchedCat.start_time) : null,
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
      let uploadSuccess = false;

      try {
        if (item.type === 'CHECKIN') {
          const { error } = await supabase.from('runners').update({
            registration_status: 'CHECKED_IN',
            checked_in_at: new Date(item.time).toISOString(),
            checked_in_by: item.operator
          }).eq('id', item.runnerId);

          if (!error) uploadSuccess = true;
          else console.warn('Background sync checkin error:', error);
        } else if (item.type === 'CP') {
          const { error } = await supabase.from('runners').update({
            cps: item.cps
          }).eq('id', item.runnerId);

          if (!error) uploadSuccess = true;
          else console.warn('Background sync CP error:', error);
        } else if (item.type === 'FINISH') {
          const { error } = await supabase.from('runners').update({
            finish: item.time
          }).eq('id', item.runnerId);

          if (!error) uploadSuccess = true;
          else console.warn('Background sync finish error:', error);
        }

        // Optional scan_logs insertion for analytics/audit trail
        if (uploadSuccess) {
          try {
            await supabase.from('scan_logs').insert([{
              runner_id: item.runnerId,
              station_id: item.stationId || null,
              scan_time: new Date(item.time).toISOString(),
              is_valid: true,
              scanned_by: item.operator || null,
              note: item.type
            }]);
          } catch (_) {}
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
        // Delay before retrying failed item
        await new Promise(r => setTimeout(r, 2500));
      }
    } finally {
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
      } catch (e) {
        console.warn('Cache parse error:', e);
      }
    }

    const cachedStations = localStorage.getItem(`trail_cached_stations_${selectedEventId}`);
    if (cachedStations) {
      try {
        setCheckpoints(JSON.parse(cachedStations));
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
        const { data: rData, error: rError } = await supabase
          .from('runners')
          .select('*')
          .eq('event_id', selectedEventId);

        if (!rError && rData) {
          const formatted = rData.map(r => {
            const matchedCat = catMap[r.cat] || (r.category_id ? catMap[r.category_id] : null);
            const checkinTime = r.checkin || (r.checked_in_at ? new Date(r.checked_in_at).getTime() : null);
            const gunStartTime = matchedCat?.start_time ? parseStartTime(matchedCat.start_time, checkinTime) : null;

            return {
              ...r,
              bib: r.bib || '',
              name: r.name || '',
              gender: r.gender || '',
              cat: r.cat || '',
              age: r.age || '',
              nat: r.nat || '',
              checkin: checkinTime,
              gunStartTime: gunStartTime,
              categoryStartTimeStr: matchedCat?.start_time ? (matchedCat.start_time.includes('T') ? new Date(matchedCat.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : matchedCat.start_time) : null,
              cps: r.cps || {},
              finish: r.finish || null
            };
          });
          setRunners(formatted);
          localStorage.setItem(`trail_cached_runners_${selectedEventId}`, JSON.stringify(formatted));
          setLastSyncedTime(Date.now());
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
        }
      } catch (err) {
        console.warn('Background fetch error, using client cache:', err);
      } finally {
        setLoadingRunners(false);
      }
    }
    fetchEventData();
  }, [selectedEventId]);

  const addToast = (msg, err = false) => {
    setToastMsg({ msg, err, id: Date.now() });
    setTimeout(() => setToastMsg(null), 2600);
  };

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
    const c = checkpoints.find(c => c.id === id);
    return c ? c.name : id;
  };

  const findRunner = (bib) => runners.find(r => String(r.bib).trim() === String(bib).trim());

  const addLog = (entry) => {
    setScanLog(prev => [entry, ...prev].sort((a, b) => b.time - a.time));
  };

  const updateRunner = (updatedRunner) => {
    setRunners(prev => prev.map(r => String(r.bib).trim() === String(updatedRunner.bib).trim() ? updatedRunner : r));
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
      addToast(`✓ เพิ่มเจ้าหน้าที่ "${trimmed}" เรียบร้อย`, false);
      return result.data;
    } catch (err) {
      console.error('Staff insert failed:', err);
      addToast(`เพิ่มเจ้าหน้าที่ "${trimmed}" ไม่สำเร็จ: ${writeErrorMessage(err)}`, true);
      return null;
    }
  };

  const processScan = (stationType, bib, stationId = null) => {
    const now = Date.now();
    const r = findRunner(bib);
    // Identity comes from the session only — callers cannot pass an operator name.
    const operator = currentOperator || 'Staff';
    let result = { success: false, runner: r, now, message: '', stationName: '', operator };

    if (!r) {
      addLog({ time: now, station: stationType === 'CheckPoint' ? getCpName(stationId) : stationType, bib, name: 'ไม่พบในระบบ', ok: false, operator });
      addToast(`ไม่พบ BIB ${bib} ในฐานข้อมูลงานนี้`, true);
      result.message = 'NOT FOUND · ไม่พบในระบบ';
      return result;
    }

    if (stationType === 'Check-in') {
      result.stationName = 'Check-in';
      if (r.checkin) {
        result.message = `Already checked-in`;
        addToast(`BIB ${r.bib} เช็คอินไปแล้ว`, true);
        addLog({ time: now, station: 'Check-in', bib, name: r.name, ok: false, msg: 'ซ้ำ', operator });
      } else {
        const updated = { ...r, checkin: now, registration_status: 'CHECKED_IN', checked_in_by: operator };
        updateRunner(updated);
        result.success = true;
        result.runner = updated;
        addToast(`✓ Check-in สำเร็จ — BIB ${r.bib} ${r.name}`);
        addLog({ time: now, station: 'Check-in', bib, name: r.name, ok: true, operator });

        // Push to asynchronous background sync queue (Zero delay / 0ms UI blocking)
        if (r.id) {
          enqueueSyncItem({
            id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            type: 'CHECKIN',
            runnerId: r.id,
            bib: r.bib,
            time: now,
            operator
          });
        }
      }
    } 
    else if (stationType === 'CheckPoint') {
      const cpName = getCpName(stationId);
      result.stationName = cpName;
      
      if (!r.checkin) {
        result.message = `ยังไม่ได้ Check-in ที่จุดสตาร์ท`;
        addToast(`BIB ${r.bib} ยังไม่ผ่าน Check-in`, true);
        addLog({ time: now, station: cpName, bib, name: r.name, ok: false, msg: 'ยังไม่เช็คอิน', operator });
      } else if (r.cps && r.cps[stationId]) {
        result.message = `Already scanned`;
        addToast(`BIB ${r.bib} ผ่าน ${cpName} ไปแล้ว`, true);
        addLog({ time: now, station: cpName, bib, name: r.name, ok: false, msg: 'ซ้ำ', operator });
      } else {
        const updated = { ...r, cps: { ...(r.cps || {}), [stationId]: now } };
        updateRunner(updated);
        result.success = true;
        result.runner = updated;
        addToast(`✓ ${cpName} — BIB ${r.bib} ${r.name}`);
        addLog({ time: now, station: cpName, bib, name: r.name, ok: true, operator });

        // Push to asynchronous background sync queue (Zero delay / 0ms UI blocking)
        if (r.id) {
          enqueueSyncItem({
            id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            type: 'CP',
            runnerId: r.id,
            bib: r.bib,
            cps: updated.cps,
            stationId,
            time: now,
            operator
          });
        }
      }
    }
    else if (stationType === 'Finish') {
      result.stationName = 'Finish';
      if (!r.checkin) {
        result.message = `ยังไม่ได้ Check-in — ไม่สามารถบันทึก Finish`;
        addToast(`BIB ${r.bib} ยังไม่ผ่าน Check-in`, true);
        addLog({ time: now, station: 'Finish', bib, name: r.name, ok: false, msg: 'ยังไม่เช็คอิน', operator });
      } else if (r.finish) {
        result.message = `Already finished`;
        addToast(`BIB ${r.bib} เข้าเส้นชัยแล้ว (ยึดเวลาแรก)`, true);
        addLog({ time: now, station: 'Finish', bib, name: r.name, ok: false, msg: 'ซ้ำ', operator });
      } else {
        const updated = { ...r, finish: now };
        updateRunner(updated);
        result.success = true;
        result.runner = updated;
        addToast(`🏁 Finish! BIB ${r.bib} ${r.name}`);
        addLog({ time: now, station: 'Finish', bib, name: r.name, ok: true, operator });

        // Push to asynchronous background sync queue (Zero delay / 0ms UI blocking)
        if (r.id) {
          enqueueSyncItem({
            id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            type: 'FINISH',
            runnerId: r.id,
            bib: r.bib,
            time: now,
            operator
          });
        }
      }
    }

    return result;
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
      checkpoints,
      loadingRunners,
      runners,
      scanLog,
      staffList,
      currentOperator,
      currentStaff: staffProfile,
      addStaff,
      toastMsg,
      processScan,
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

