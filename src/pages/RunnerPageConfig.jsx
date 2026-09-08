import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { assertWriteOk } from '../lib/supabaseResult';
import { useRace } from '../context/RaceContext';
import {
  MonitorPlay,
  CheckCircle2,
  XCircle,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  AlertCircle,
  Smartphone,
  Tv,
  Receipt,
  LayoutDashboard,
  Trophy,
  ExternalLink,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

const RUNNER_PAGES = [
  {
    id: 'scanner',
    name: 'Check-in Scanner',
    path: '/scanner',
    icon: Smartphone,
    iconEmoji: '📱',
    desc: 'ระบบสแกน BIB นักวิ่งเข้าสู่จอ Monitor (สำหรับจุดสตาร์ท)',
    defaultNotice: 'ระบบสแกนยังไม่เปิดให้บริการในขณะนี้'
  },
  {
    id: 'monitor',
    name: 'Monitor TV',
    path: '/monitor/1',
    icon: Tv,
    iconEmoji: '🖥️',
    desc: 'หน้าจอขนาดใหญ่แสดงผลการเช็คอินแบบ Real-time สำหรับงานวิ่ง',
    defaultNotice: 'หน้าจอ Monitor ยังไม่เปิดใช้งานในขณะนี้'
  },
  {
    id: 'eslip',
    name: 'E-Slip Result',
    path: '/eslip',
    icon: Receipt,
    iconEmoji: '🎟️',
    desc: 'ค้นหา BIB เพื่อดูและดาวน์โหลดสลิปผลการแข่งขัน (E-Slip)',
    defaultNotice: 'ระบบตรวจสอบ E-Slip จะเปิดให้บริการหลังประกาศผลการแข่งขัน'
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    iconEmoji: '📊',
    desc: 'หน้ารายงานสรุปจำนวนนักวิ่ง สถานะ DNS/DNF/In Race/Finished',
    defaultNotice: 'หน้าสรุปสถิติยังไม่เปิดให้เข้าใช้งาน'
  },
  {
    id: 'leaderboard',
    name: 'Leaderboard',
    path: '/leaderboard',
    icon: Trophy,
    iconEmoji: '🏆',
    desc: 'ตารางรายงานอันดับผู้นำ Live Leaderboard (Top 5 แต่ละรุ่นอายุ)',
    defaultNotice: 'Live Leaderboard จะเปิดให้ตรวจสอบขณะปล่อยตัวการแข่งขัน'
  }
];

const DEFAULT_CONFIG = {
  scanner: true,
  monitor: true,
  eslip: true,
  dashboard: true,
  leaderboard: true,
  displayMode: 'disabled_badge', // 'disabled_badge' or 'hidden'
  notices: {
    scanner: 'ระบบสแกนยังไม่เปิดให้บริการในขณะนี้',
    monitor: 'หน้าจอ Monitor ยังไม่เปิดใช้งานในขณะนี้',
    eslip: 'ระบบตรวจสอบ E-Slip จะเปิดให้บริการหลังประกาศผลการแข่งขัน',
    dashboard: 'หน้าสรุปสถิติยังไม่เปิดให้เข้าใช้งาน',
    leaderboard: 'Live Leaderboard จะเปิดให้ตรวจสอบขณะปล่อยตัวการแข่งขัน'
  }
};

export default function RunnerPageConfig() {
  const { addToast } = useRace();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [configRowId, setConfigRowId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Events
  useEffect(() => {
    async function fetchEvents() {
      const { data } = await supabase
        .from('events')
        .select('id, name')
        .order('start_date', { ascending: false });

      if (data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
      }
    }
    fetchEvents();
  }, []);

  // Fetch Configuration for Selected Event
  useEffect(() => {
    if (!selectedEventId) return;

    async function loadConfig() {
      setLoading(true);
      try {
        // Look for special config row in runners table
        const { data, error } = await supabase
          .from('runners')
          .select('id, cps')
          .eq('event_id', selectedEventId)
          .eq('bib', 'RUNNER_CONFIG')
          .maybeSingle();

        if (data && data.cps && typeof data.cps === 'object' && Object.keys(data.cps).length > 0) {
          setConfigRowId(data.id);
          setConfig({
            scanner: data.cps.scanner ?? true,
            monitor: data.cps.monitor ?? true,
            eslip: data.cps.eslip ?? true,
            dashboard: data.cps.dashboard ?? true,
            leaderboard: data.cps.leaderboard ?? true,
            displayMode: data.cps.displayMode || 'disabled_badge',
            notices: {
              ...DEFAULT_CONFIG.notices,
              ...(data.cps.notices || {})
            }
          });
        } else {
          // Check localStorage as fallback
          try {
            const local = localStorage.getItem(`rohn_runner_page_config_${selectedEventId}`);
            if (local) {
              const parsed = JSON.parse(local);
              setConfig({ ...DEFAULT_CONFIG, ...parsed });
            } else {
              setConfig(DEFAULT_CONFIG);
            }
          } catch {
            setConfig(DEFAULT_CONFIG);
          }
          setConfigRowId(null);
        }
      } catch (err) {
        console.error('Load runner page config error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, [selectedEventId]);

  const handleTogglePage = (pageId) => {
    setConfig(prev => ({
      ...prev,
      [pageId]: !prev[pageId]
    }));
  };

  const handleNoticeChange = (pageId, text) => {
    setConfig(prev => ({
      ...prev,
      notices: {
        ...prev.notices,
        [pageId]: text
      }
    }));
  };

  const handleSetAll = (enabled) => {
    setConfig(prev => ({
      ...prev,
      scanner: enabled,
      monitor: enabled,
      eslip: enabled,
      dashboard: enabled,
      leaderboard: enabled
    }));
  };

  const handleSave = async () => {
    if (!selectedEventId) return;
    setIsSaving(true);

    try {
      // 1. Save to Supabase runners table with special bib 'RUNNER_CONFIG'
      const payload = {
        event_id: selectedEventId,
        bib: 'RUNNER_CONFIG',
        name: 'RUNNER_PAGE_CONFIG',
        cat: 'SYSTEM',
        registration_status: 'PRE_REGISTERED',
        cps: config,
        updated_at: new Date().toISOString()
      };

      if (configRowId) {
        assertWriteOk(
          await supabase
            .from('runners')
            .update(payload)
            .eq('id', configRowId)
            .select('id')
        );
      } else {
        const { data, error } = await supabase
          .from('runners')
          .insert([payload])
          .select('id')
          .single();

        if (error) {
          // In case row already exists with same event_id and bib
          assertWriteOk(
            await supabase
              .from('runners')
              .update(payload)
              .eq('event_id', selectedEventId)
              .eq('bib', 'RUNNER_CONFIG')
              .select('id')
          );
        } else if (data?.id) {
          setConfigRowId(data.id);
        }
      }

      // 2. Broadcast via Supabase Realtime channel
      try {
        const channel = supabase.channel(`results:${selectedEventId}`);
        await channel.send({
          type: 'broadcast',
          event: 'config_update',
          payload: { config }
        });
      } catch (broadcastErr) {
        console.warn('Realtime broadcast warning:', broadcastErr);
      }

      // 3. Save to localStorage for instant local sync
      try {
        localStorage.setItem(`rohn_runner_page_config_${selectedEventId}`, JSON.stringify(config));
        localStorage.setItem('rohn_runner_page_config', JSON.stringify(config));
      } catch {}

      addToast('✅ บันทึกการตั้งค่าการแสดงผล Runner เรียบร้อยแล้ว');
    } catch (err) {
      console.error('Save config error:', err);
      addToast(`บันทึกไม่สำเร็จ: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page active" style={{ maxWidth: '1000px', margin: '0 auto', overflowX: 'hidden' }}>
      
      {/* ── Page Header ── */}
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontWeight: 700 }}>
            <MonitorPlay size={14} /> Runner App Access Control
          </span>
          <h1 style={{ margin: '4px 0 0 0', fontSize: '28px', fontWeight: 800 }}>
            จัดการการแสดงผล Runner (Home.jsx)
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>
            กำหนดว่าการ์ดและหน้าใดในแอปพลิเคชัน Rohn-Runner ที่อนุญาตให้นักวิ่ง/ผู้ชมเข้าใช้งานได้
          </p>
        </div>

        {/* Event Selector */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              fontWeight: 600,
              background: '#ffffff',
              color: '#0f172a',
              cursor: 'pointer'
            }}
          >
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Controls & Quick Actions ── */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '20px 24px',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        {/* Display Mode Toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
            รูปแบบเมื่อปิดการใช้งาน (Display Mode):
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer', color: '#475569' }}>
              <input
                type="radio"
                name="displayMode"
                value="disabled_badge"
                checked={config.displayMode === 'disabled_badge'}
                onChange={() => setConfig(prev => ({ ...prev, displayMode: 'disabled_badge' }))}
                style={{ accentColor: '#2563eb' }}
              />
              แสดงการ์ดพร้อมป้าย "ปิดปรับปรุง" (แนะนำ)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer', color: '#475569' }}>
              <input
                type="radio"
                name="displayMode"
                value="hidden"
                checked={config.displayMode === 'hidden'}
                onChange={() => setConfig(prev => ({ ...prev, displayMode: 'hidden' }))}
                style={{ accentColor: '#2563eb' }}
              />
              ซ่อนการ์ดออกจากการแสดงผล
            </label>
          </div>
        </div>

        {/* Quick Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => handleSetAll(true)}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '13px',
              fontWeight: 600,
              color: '#16a34a',
              cursor: 'pointer'
            }}
          >
            ✓ เปิดทั้งหมด
          </button>
          <button
            type="button"
            onClick={() => handleSetAll(false)}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '13px',
              fontWeight: 600,
              color: '#dc2626',
              cursor: 'pointer'
            }}
          >
            ✕ ปิดทั้งหมด
          </button>
        </div>
      </div>

      {/* ── Page Cards List ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
        {RUNNER_PAGES.map((page) => {
          const isEnabled = config[page.id] !== false;
          const IconComp = page.icon;
          const noticeText = config.notices?.[page.id] ?? page.defaultNotice;

          return (
            <div
              key={page.id}
              style={{
                background: '#ffffff',
                border: `1.5px solid ${isEnabled ? '#bfdbfe' : '#e2e8f0'}`,
                borderRadius: '16px',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '20px',
                boxShadow: isEnabled ? '0 4px 12px rgba(37, 99, 235, 0.05)' : 'none',
                transition: 'all 0.2s ease',
                opacity: isEnabled ? 1 : 0.82
              }}
            >
              {/* Left Column: Icon + Title + Description */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flex: 1, minWidth: '280px' }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: isEnabled ? '#eff6ff' : '#f1f5f9',
                  color: isEnabled ? '#2563eb' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0
                }}>
                  {page.iconEmoji}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                      {page.name}
                    </h3>
                    <code style={{
                      background: '#f1f5f9',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#475569',
                      fontWeight: 600
                    }}>
                      {page.path}
                    </code>
                  </div>

                  <p style={{ margin: '6px 0 12px 0', fontSize: '13.5px', color: '#64748b', lineHeight: 1.4 }}>
                    {page.desc}
                  </p>

                  {/* Notice text box (shown when disabled or always editable) */}
                  {!isEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '500px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626' }}>
                        ข้อความแจ้งเตือนเมื่อผู้ใช้กดเข้ามา:
                      </span>
                      <input
                        type="text"
                        value={noticeText}
                        onChange={(e) => handleNoticeChange(page.id, e.target.value)}
                        placeholder="ระบุข้อความแจ้งเตือนผู้ใช้งาน..."
                        style={{
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: '1px solid #fecdd3',
                          background: '#fff1f2',
                          fontSize: '13px',
                          outline: 'none',
                          color: '#9f1239'
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Toggle Button & Status */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', minWidth: '150px' }}>
                <button
                  type="button"
                  onClick={() => handleTogglePage(page.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '30px',
                    border: 'none',
                    background: isEnabled ? '#16a34a' : '#94a3b8',
                    color: '#ffffff',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: isEnabled ? '0 2px 6px rgba(22, 163, 74, 0.25)' : 'none',
                    transition: 'background 0.2s'
                  }}
                >
                  {isEnabled ? (
                    <>
                      <CheckCircle2 size={16} /> อนุญาตให้ใช้งาน
                    </>
                  ) : (
                    <>
                      <XCircle size={16} /> ปิดการใช้งาน
                    </>
                  )}
                </button>

                <span style={{ fontSize: '12px', color: isEnabled ? '#16a34a' : '#64748b', fontWeight: 600 }}>
                  {isEnabled ? '🟢 แสดงบน Home ปกติ' : (config.displayMode === 'hidden' ? '👁️‍🗨️ ซ่อนจากการแสดงผล' : '🔒 แสดงป้ายปิดปรับปรุง')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Save Toolbar ── */}
      <div style={{
        position: 'sticky',
        bottom: '20px',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '16px',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldCheck size={20} color="#16a34a" />
          <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#334155' }}>
            การตั้งค่าจะมีผลกับหน้า <code>Rohn-Runner/src/pages/Home.jsx</code> และทุกหน้าที่เกี่ยวข้องทันที
          </span>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 28px',
            borderRadius: '10px',
            border: 'none',
            background: '#2563eb',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '15px',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 8px rgba(37, 99, 235, 0.25)',
            transition: 'background 0.15s'
          }}
        >
          <Save size={18} />
          {isSaving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </button>
      </div>

    </div>
  );
}
