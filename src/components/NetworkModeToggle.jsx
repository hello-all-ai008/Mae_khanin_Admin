import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useRace } from '../context/RaceContext';

export default function NetworkModeToggle({ style = {}, compact = false }) {
  const { networkMode, toggleNetworkMode, isOnline } = useRace();
  const isOffline = networkMode === 'offline';

  return (
    <button
      type="button"
      onClick={toggleNetworkMode}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: compact ? '4px 9px' : '6px 12px',
        borderRadius: '9px',
        background: isOffline ? '#fef2f2' : (isOnline ? '#f0fdf4' : '#fffbeb'),
        border: `1px solid ${isOffline ? '#fca5a5' : (isOnline ? '#86efac' : '#fde68a')}`,
        color: isOffline ? '#b91c1c' : (isOnline ? '#15803d' : '#b45309'),
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        userSelect: 'none',
        transition: 'all 0.15s ease',
        ...style
      }}
      title={
        isOffline
          ? "โหมด: ออฟไลน์ (ข้อมูลเก็บในเครื่องเท่านั้น ไม่ส่งอินเทอร์เน็ต) — คลิกเพื่อสลับเป็นโหมด Auto"
          : (isOnline
              ? "โหมด: Auto (ออนไลน์ - ซิงค์คลาวด์อัตโนมัติ) — คลิกเพื่อสลับเป็นโหมด ออฟไลน์"
              : "โหมด: Auto (เน็ตไม่พร้อมใช้งาน - ข้อมูลจะพักรอส่งอัตโนมัติ) — คลิกเพื่อสลับเป็นโหมด ออฟไลน์")
      }
    >
      {isOffline ? (
        <>
          <WifiOff size={14} color="#dc2626" />
          <span>ออฟไลน์</span>
        </>
      ) : (
        <>
          <Wifi size={14} color={isOnline ? "#16a34a" : "#d97706"} />
          <span>Auto</span>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: isOnline ? '#22c55e' : '#f59e0b',
              display: 'inline-block',
              boxShadow: isOnline ? '0 0 6px #22c55e' : 'none'
            }}
          />
        </>
      )}
    </button>
  );
}
