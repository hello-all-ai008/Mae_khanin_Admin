import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRace } from '../context/RaceContext';
import StaffSetup from '../components/event-setup/StaffSetup';
import { UserCheck, CalendarDays, RefreshCw } from 'lucide-react';

export default function StaffManager() {
  const { events: contextEvents, selectedEventId: contextEventId, setSelectedEventId } = useRace();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setLocalSelectedEventId] = useState('');

  useEffect(() => {
    async function fetchEvents() {
      const { data } = await supabase.from('events').select('id, name').order('start_date', { ascending: false });
      if (data && data.length > 0) {
        setEvents(data);
        setLocalSelectedEventId(contextEventId || data[0].id);
      }
    }
    fetchEvents();
  }, [contextEventId]);

  const handleEventChange = (e) => {
    const id = e.target.value;
    setLocalSelectedEventId(id);
    if (setSelectedEventId) setSelectedEventId(id);
  };

  return (
    <div className="page active">
      {/* ── Page Header ── */}
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <span className="station-tag" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
            <span className="dot" style={{ background: '#0284c7' }}></span>Staff & Marshals
          </span>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserCheck size={28} /> จัดการเจ้าหน้าที่ / ผู้สแกน (Staff Management)
          </h1>
          <p>เพิ่ม แก้ไข และกำหนดบทบาทเจ้าหน้าที่ประจำจุดตรวจ (Check-in, Check Point, Finish Line)</p>
        </div>

        {/* Global Event Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-soft)', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <CalendarDays size={15} /> สังกัดงานวิ่ง:
          </label>
          <select 
            className="search" 
            style={{ width: '220px', padding: '6px 10px', fontSize: '0.85rem' }}
            value={selectedEventId} 
            onChange={handleEventChange}
          >
            {events.length === 0 && <option value="">ไม่มีงานวิ่งในระบบ</option>}
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Staff Setup Component ── */}
      <StaffSetup eventId={selectedEventId} />
    </div>
  );
}
