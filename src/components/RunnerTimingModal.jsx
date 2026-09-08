import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { assertWriteOk } from '../lib/supabaseResult';
import { X, CheckCircle2, AlertTriangle, Ban, RotateCcw, Clock, Flag, Save } from 'lucide-react';

export default function RunnerTimingModal({
  isOpen,
  onClose,
  runner,
  categoryCheckpoints = [],
  allStations = [],
  onSaved
}) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedInAtStr, setCheckedInAtStr] = useState('');
  const [cps, setCps] = useState({});
  const [finishStr, setFinishStr] = useState('');
  const [isDnf, setIsDnf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Helper to convert Date/epoch/ISO to datetime-local input string (YYYY-MM-DDTHH:mm:ss)
  const toInputDateTime = (val) => {
    if (!val) return '';
    try {
      const d = typeof val === 'number' ? new Date(val) : new Date(val);
      if (isNaN(d.getTime())) return '';
      // Bangkok timezone / Local time representation
      const pad = (n) => String(n).padStart(2, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const date = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      return `${year}-${month}-${date}T${hours}:${minutes}:${seconds}`;
    } catch {
      return '';
    }
  };

  // Helper to convert input datetime-local string back to Epoch MS
  const inputToEpoch = (str) => {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.getTime();
  };

  const getNowInputString = () => toInputDateTime(new Date());

  useEffect(() => {
    if (isOpen && runner) {
      const hasCheckin = Boolean(runner.checked_in_at || runner.registration_status === 'CHECKED_IN');
      setCheckedIn(hasCheckin);
      setCheckedInAtStr(runner.checked_in_at ? toInputDateTime(runner.checked_in_at) : (hasCheckin ? getNowInputString() : ''));
      
      const currentCps = runner.cps && typeof runner.cps === 'object' ? { ...runner.cps } : {};
      setCps(currentCps);
      setIsDnf(Boolean(currentCps.DNF || runner.is_dnf));

      setFinishStr(runner.finish ? toInputDateTime(runner.finish) : '');
    }
  }, [isOpen, runner]);

  if (!isOpen || !runner) return null;

  // Compute required stations for this runner's category route
  // If checkpoints are configured for category, use them. Otherwise fallback to all event stations.
  let routeStations = [];
  if (categoryCheckpoints && categoryCheckpoints.length > 0) {
    routeStations = categoryCheckpoints.map(cp => {
      const st = Array.isArray(cp.stations) ? cp.stations[0] : (cp.stations || {});
      return {
        id: cp.station_id || st.id,
        name: st.name || `Checkpoint ${cp.sequence_order}`,
        type: st.type || 'CP',
        sequence_order: cp.sequence_order,
        cutoff_time: cp.cutoff_time
      };
    });
  } else if (allStations && allStations.length > 0) {
    routeStations = allStations.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type || 'CP',
      sequence_order: s.sequence_order || 1,
      cutoff_time: null
    }));
  }

  // Handle station time change
  const handleStationTimeChange = (stationId, inputVal) => {
    const epoch = inputToEpoch(inputVal);
    setCps(prev => {
      const next = { ...prev };
      if (epoch) {
        next[stationId] = epoch;
      } else {
        delete next[stationId];
      }
      return next;
    });
  };

  const setStationNow = (stationId) => {
    setCps(prev => ({
      ...prev,
      [stationId]: Date.now()
    }));
  };

  const clearStationTime = (stationId) => {
    setCps(prev => {
      const next = { ...prev };
      delete next[stationId];
      return next;
    });
  };

  // Quick action: Mark as DNS (Did Not Start)
  const handleSetDns = () => {
    if (!window.confirm(`ยืนยันตั้งสถานะ BIB ${runner.bib} เป็น DNS (Did Not Start)? \nระบบจะล้างเวลาเช็คอิน, จุดตรวจ และเส้นชัยทั้งหมด`)) return;
    setCheckedIn(false);
    setCheckedInAtStr('');
    setCps({});
    setFinishStr('');
    setIsDnf(false);
  };

  // Quick action: Mark as DNF (Did Not Finish)
  const handleToggleDnf = () => {
    if (!isDnf) {
      setIsDnf(true);
      setFinishStr(''); // Remove finish line if marked DNF
      setCps(prev => ({
        ...prev,
        DNF: true,
        dnf_time: Date.now()
      }));
    } else {
      setIsDnf(false);
      setCps(prev => {
        const next = { ...prev };
        delete next.DNF;
        delete next.dnf_time;
        delete next.dnf_station;
        return next;
      });
    }
  };

  // Quick action: Reset runner progress
  const handleResetRunner = () => {
    if (!window.confirm(`ยืนยันการรีเซ็ตข้อมูลความคืบหน้าของ BIB ${runner.bib} กลับสู่สถานะตั้งต้น?`)) return;
    setCheckedIn(false);
    setCheckedInAtStr('');
    setCps({});
    setFinishStr('');
    setIsDnf(false);
  };

  // Save changes to Supabase
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const finalRegistrationStatus = checkedIn ? 'CHECKED_IN' : 'PRE_REGISTERED';
      const finalCheckedInAt = checkedIn && checkedInAtStr ? new Date(checkedInAtStr).toISOString() : (checkedIn ? new Date().toISOString() : null);

      const finalCps = { ...cps };
      if (isDnf) {
        finalCps.DNF = true;
      } else {
        delete finalCps.DNF;
      }

      // Finish time: store epoch or timestamp
      const finishEpoch = inputToEpoch(finishStr);
      const finalFinish = finishEpoch ? finishEpoch : null;

      const payload = {
        registration_status: finalRegistrationStatus,
        checked_in_at: finalCheckedInAt,
        cps: finalCps,
        finish: finalFinish,
        updated_at: new Date().toISOString()
      };

      assertWriteOk(
        await supabase
          .from('runners')
          .update(payload)
          .eq('id', runner.id)
          .select('id')
      );

      const updatedRunner = {
        ...runner,
        ...payload
      };

      onSaved?.(updatedRunner);
      onClose();
    } catch (err) {
      console.error('Save runner timing error:', err);
      alert(`บันทึกข้อมูลไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        width: '100%',
        maxWidth: '820px',
        maxHeight: '90vh',
        borderRadius: '16px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                background: '#0f172a',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '18px',
                padding: '4px 10px',
                borderRadius: '8px'
              }}>
                BIB {runner.bib}
              </span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                {runner.name || 'ไม่ระบุชื่อ'}
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              ระยะ: <strong>{runner.cat || runner.distance || 'ไม่ระบุ'}</strong> | เพศ: {runner.gender || '—'} | รุ่นอายุ: {runner.age || runner.age_group || '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Quick Actions Toolbar */}
          <div style={{
            background: '#f1f5f9',
            padding: '12px 16px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>ตั้งค่าสถานะด่วน:</span>
              <button
                type="button"
                onClick={handleSetDns}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#64748b',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Ban size={14} color="#dc2626" /> ตั้งเป็น DNS
              </button>

              <button
                type="button"
                onClick={handleToggleDnf}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: isDnf ? '1px solid #ea580c' : '1px solid #cbd5e1',
                  background: isDnf ? '#ffedd5' : '#ffffff',
                  color: isDnf ? '#c2410c' : '#64748b',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <AlertTriangle size={14} color={isDnf ? '#ea580c' : '#64748b'} />
                {isDnf ? 'สถานะ: DNF (คลิกเพื่อยกเลิก)' : 'ตั้งเป็น DNF'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleResetRunner}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #fee2e2',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={14} /> รีเซ็ตเป็นค่าเริ่มต้น
            </button>
          </div>

          {/* 1. Check-In Section */}
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '16px 20px',
            background: checkedIn ? '#f0fdf4' : '#ffffff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color={checkedIn ? '#16a34a' : '#94a3b8'} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>1. การเช็คอิน (Check-In)</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={checkedIn}
                  onChange={(e) => {
                    setCheckedIn(e.target.checked);
                    if (e.target.checked && !checkedInAtStr) setCheckedInAtStr(getNowInputString());
                    if (!e.target.checked) setCheckedInAtStr('');
                  }}
                  style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                />
                เช็คอินแล้ว
              </label>
            </div>

            {checkedIn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>เวลาที่เช็คอิน:</span>
                <input
                  type="datetime-local"
                  step="1"
                  value={checkedInAtStr}
                  onChange={(e) => setCheckedInAtStr(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setCheckedInAtStr(getNowInputString())}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  ใช้เวลาปัจจุบัน
                </button>
                <button
                  type="button"
                  onClick={() => { setCheckedIn(false); setCheckedInAtStr(''); }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#fee2e2',
                    color: '#b91c1c',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  ล้างเวลา
                </button>
              </div>
            )}
          </div>

          {/* 2. Stations Route Section (Based on DatabaseFlow checkpoints) */}
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '16px 20px',
            background: '#ffffff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="#2563eb" />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  2. จุดตรวจตามเส้นทาง (Stations & Checkpoints)
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                อิงตามจุดตรวจที่ผูกไว้กับระยะ {runner.cat || runner.distance}
              </span>
            </div>

            {routeStations.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                ยังไม่มีจุดตรวจผูกไว้กับระยะนี้ในระบบ
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {routeStations.map((station, idx) => {
                  const sId = station.id;
                  const scanVal = cps[sId];
                  const hasScanned = scanVal != null;
                  const currentInputStr = hasScanned ? toInputDateTime(scanVal) : '';

                  return (
                    <div
                      key={sId || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        background: hasScanned ? '#f8fafc' : '#ffffff',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' }}>
                        <span style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: hasScanned ? '#3b82f6' : '#cbd5e1',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700
                        }}>
                          {idx + 1}
                        </span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                            {station.name}
                          </div>
                          <span style={{
                            fontSize: '11px',
                            color: station.type === 'START' ? '#16a34a' : (station.type === 'FINISH' ? '#7c3aed' : '#2563eb'),
                            fontWeight: 600
                          }}>
                            {station.type}
                          </span>
                        </div>
                      </div>

                      {/* Time input & actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                          type="datetime-local"
                          step="1"
                          value={currentInputStr}
                          onChange={(e) => handleStationTimeChange(sId, e.target.value)}
                          placeholder="ยังไม่สแกน"
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: `1px solid ${hasScanned ? '#3b82f6' : '#cbd5e1'}`,
                            fontSize: '13px',
                            background: hasScanned ? '#eff6ff' : '#ffffff',
                            outline: 'none'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setStationNow(sId)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          สแกนตอนนี้
                        </button>
                        {hasScanned && (
                          <button
                            type="button"
                            onClick={() => clearStationTime(sId)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            ลบ
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Finish Line Section */}
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '16px 20px',
            background: finishStr ? '#faf5ff' : '#ffffff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flag size={18} color={finishStr ? '#9333ea' : '#94a3b8'} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>3. เข้าเส้นชัย (Finish Line)</span>
              </div>
              {finishStr && (
                <span style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#7e22ce',
                  background: '#f3e8ff',
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}>
                  FINISHED
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>เวลาเข้าเส้นชัย:</span>
              <input
                type="datetime-local"
                step="1"
                value={finishStr}
                onChange={(e) => {
                  setFinishStr(e.target.value);
                  if (e.target.value) setIsDnf(false);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${finishStr ? '#9333ea' : '#cbd5e1'}`,
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setFinishStr(getNowInputString());
                  setIsDnf(false);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                เข้าเส้นชัยตอนนี้
              </button>
              {finishStr && (
                <button
                  type="button"
                  onClick={() => setFinishStr('')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#fee2e2',
                    color: '#b91c1c',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  ล้างเวลา
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '12px',
          background: '#f8fafc'
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 22px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '14px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
            }}
          >
            <Save size={16} />
            {isSaving ? 'กำลังบันทึก…' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </div>
      </div>
    </div>
  );
}
