import React from 'react';
import { RefreshCw, CheckCircle2, WifiOff, Clock, AlertCircle } from 'lucide-react';
import { useRace } from '../context/RaceContext';

/**
 * ScanSyncBadge Component
 * แสดงสถานะการส่งข้อมูลไปยัง Database (Supabase Cloud)
 * - กำลังส่ง: มี Icon animation หมุน (spin)
 * - ส่งแล้ว: แสดงเครื่องหมายถูกสีเขียว (synced)
 * - รอเน็ต: แสดงไอคอนออฟไลน์และสถานะรอส่งเมื่อต่อเน็ต
 */
export default function ScanSyncBadge({ log }) {
  const { pendingSyncQueue, isOnline, currentlySyncingId } = useRace();

  if (!log) return null;

  // กรณีสแกนไม่ผ่าน (เช่น ซ้ำ, ไม่พบข้อมูล, ยังไม่เช็คอิน) จะไม่ถูกส่งไป DB
  if (!log.ok) {
    return (
      <span className="db-sync-badge err" title={`สแกนไม่ผ่าน: ${log.msg || 'ข้อมูลไม่ถูกต้อง'} (ไม่ส่ง Database)`}>
        <AlertCircle size={12} />
        <span>{log.msg || 'ไม่ผ่าน'}</span>
      </span>
    );
  }

  // ตรวจสอบว่ารายการนี้ยังค้างอยู่ใน pending queue หรือไม่
  const isPending = log.syncId 
    ? pendingSyncQueue.some(q => q.id === log.syncId) 
    : false;

  const isActivelySyncing = isPending && (
    currentlySyncingId === log.syncId || 
    (isOnline && pendingSyncQueue[0]?.id === log.syncId)
  );

  if (isPending) {
    if (isOnline) {
      return (
        <span 
          className="db-sync-badge syncing" 
          title="กำลังเชื่อมต่อและบันทึกข้อมูลขึ้น Database บนคลาวด์..."
        >
          <RefreshCw size={12} className="spin" />
          <span>{isActivelySyncing ? 'กำลังส่ง...' : 'รอคิวส่ง'}</span>
        </span>
      );
    } else {
      return (
        <span 
          className="db-sync-badge offline" 
          title="บันทึกลงหน่วยความจำของเครื่องแล้วอย่างปลอดภัย — ระบบจะส่งขึ้น Database ทันทีที่เชื่อมต่อเน็ต"
        >
          <WifiOff size={12} />
          <span>รอเน็ต (ในเครื่อง)</span>
        </span>
      );
    }
  }

  // ส่งขึ้น Database สำเร็จเรียบร้อยแล้ว
  return (
    <span 
      className="db-sync-badge synced" 
      title="ข้อมูลถูกบันทึกและซิงค์ขึ้น Supabase Database สำเร็จเรียบร้อยแล้ว ✓"
    >
      <CheckCircle2 size={12} />
      <span>ส่งแล้ว</span>
    </span>
  );
}
