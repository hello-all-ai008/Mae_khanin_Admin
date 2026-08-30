import { useEffect, useRef, useState } from 'react';
import { LogOut, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRace } from '../context/RaceContext';

// Signing out at a remote checkpoint is destructive: login needs the network, so a
// marshal who taps this offline has a dead station for the rest of the race, and
// anything still sitting in the offline queue can never be sent by that device.
// The button therefore confirms first and refuses while offline or while scans
// are still pending, and it states the reason instead of failing silently.
//
// Being offline stays a HARD block — there is nothing useful to do offline, and
// signing out would only strand the device. A stuck queue is different: a scan
// can become permanently unsyncable (its runner row was deleted, RLS refuses
// this operator, a stale id), and then pendingCount never reaches zero and the
// next shift can never take over the station. So the queue block is two-tier:
// the first tap still refuses and says why, and only then is an explicit
// "sign out anyway" offered, behind its own confirmation.
const CONFIRM_TITLE = 'ยืนยันการออกจากระบบ';
const CONFIRM_MESSAGE =
  'ออกจากระบบแล้วต้องเข้าใหม่ด้วย PIN และต้องมีสัญญาณอินเทอร์เน็ตเท่านั้น\nยืนยันที่จะออกจากระบบหรือไม่?';
const OFFLINE_REASON = 'ออกจากระบบไม่ได้ขณะออฟไลน์ — ต้องมีสัญญาณเน็ตจึงจะเข้าสู่ระบบใหม่ได้';
const SIGN_OUT_FAILED = 'ออกจากระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
const ABANDON_LABEL = 'ออกจากระบบโดยไม่รอซิงค์';
const ABANDON_TITLE = 'ทิ้งข้อมูลที่ยังไม่ได้ซิงค์?';

const pendingReason = (count) =>
  `ยังมีข้อมูลสแกนค้างส่ง ${count} รายการ — กรุณากดซิงค์ให้ครบก่อนออกจากระบบ`;

const abandonMessage = (count) =>
  `มีข้อมูล ${count} รายการที่ยังไม่ได้บันทึกขึ้นระบบ ต้องการออกจากระบบโดยไม่รอซิงค์ใช่หรือไม่\n\n` +
  'ข้อมูลสแกนเหล่านี้จะถูกลบออกจากเครื่องและกู้คืนไม่ได้ ใช้เมื่อข้อมูลค้างส่งไม่สำเร็จซ้ำ ๆ เท่านั้น';

/**
 * @param {{ style?: object, className?: string, label?: string, onDone?: () => void }} props
 */
export default function SignOutButton({ style, className, label = 'ออกจากระบบ', onDone }) {
  const { signOut } = useAuth();
  const { showConfirm, addToast, isOnline, pendingSyncQueue, clearPendingSyncQueue } = useRace();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEscapeOffered, setIsEscapeOffered] = useState(false);

  const pendingCount = pendingSyncQueue?.length || 0;
  const isQueueBlocked = isOnline && pendingCount > 0;
  let blockedReason = null;
  if (!isOnline) blockedReason = OFFLINE_REASON;
  else if (pendingCount > 0) blockedReason = pendingReason(pendingCount);

  // The confirmation dialog spans renders, so read the queue from a ref at the
  // moment it is dropped: a scan taken while the dialog was open must still be
  // logged rather than vanish unrecorded.
  const queueRef = useRef(pendingSyncQueue);
  useEffect(() => {
    queueRef.current = pendingSyncQueue;
  }, [pendingSyncQueue]);

  // The queue is only unblocked by syncing; stop advertising the escape once
  // there is nothing left to abandon.
  useEffect(() => {
    if (!isQueueBlocked) setIsEscapeOffered(false);
  }, [isQueueBlocked]);

  const finishSignOut = async () => {
    setIsSigningOut(true);
    const result = await signOut();
    if (!result?.success) {
      // The session is cleared either way; say so rather than pretend it worked.
      addToast(result?.message || SIGN_OUT_FAILED, true);
    }
    onDone?.();
  };

  const handleClick = async () => {
    if (blockedReason) {
      addToast(blockedReason, true);
      // Offer the escape only after the block has been shown and explained.
      if (isQueueBlocked) setIsEscapeOffered(true);
      return;
    }

    const confirmed = await showConfirm(CONFIRM_TITLE, CONFIRM_MESSAGE);
    if (!confirmed) return;

    await finishSignOut();
  };

  const handleAbandonAndSignOut = async () => {
    const confirmed = await showConfirm(ABANDON_TITLE, abandonMessage(pendingCount));
    if (!confirmed) return;

    // There is no server-side logging path from the client, so the console is the
    // only record: dump the queue in full so the scans can be re-entered by hand.
    const abandoned = queueRef.current || [];
    console.warn(
      `[SignOutButton] Abandoning ${abandoned.length} unsynced scan(s) at operator request:`,
      JSON.stringify(abandoned)
    );

    clearPendingSyncQueue();
    setIsEscapeOffered(false);
    await finishSignOut();
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleClick}
        disabled={isSigningOut}
        title={blockedReason || 'ออกจากระบบ แล้วให้เจ้าหน้าที่คนถัดไปเข้าด้วย PIN ของตัวเอง'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '5px 10px',
          fontSize: '12px',
          fontWeight: 600,
          borderRadius: '8px',
          border: '1px solid var(--line)',
          background: 'var(--bg-soft)',
          color: blockedReason ? 'var(--ink-2)' : 'var(--ink)',
          cursor: isSigningOut ? 'not-allowed' : 'pointer',
          opacity: blockedReason || isSigningOut ? 0.6 : 1,
          ...style,
        }}
      >
        <LogOut size={14} /> {isSigningOut ? 'กำลังออก...' : label}
      </button>

      {isEscapeOffered && isQueueBlocked && (
        <button
          type="button"
          onClick={handleAbandonAndSignOut}
          disabled={isSigningOut}
          title={`ทิ้งข้อมูลค้างส่ง ${pendingCount} รายการ แล้วออกจากระบบ`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 700,
            borderRadius: '8px',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#b91c1c',
            cursor: isSigningOut ? 'not-allowed' : 'pointer',
            opacity: isSigningOut ? 0.6 : 1,
            ...style,
          }}
        >
          <AlertTriangle size={14} /> {ABANDON_LABEL} ({pendingCount})
        </button>
      )}
    </>
  );
}
