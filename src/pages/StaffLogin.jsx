import { useState, useEffect, useCallback } from 'react';
import { KeyRound, WifiOff, AlertCircle, LogIn, ChevronLeft } from 'lucide-react';
import logoRohnFull from '../LOGO/logo-rohn-full.png';
import { useAuth } from '../context/AuthContext';
import { fetchLoginEvents, fetchLoginSlots } from '../lib/loginOptions';
import PinKeypad from '../components/auth/PinKeypad';

const MAX_PIN_LENGTH = 12;
const MIN_PIN_LENGTH = 4;

// The event-wide slot (e.g. ADMIN) carries `station_id: null` from the server.
// <select> values are always strings, so this sentinel stands in for it in the
// DOM and is mapped back to a real `null` right before the PIN step submits.
const EVENT_WIDE_VALUE = '__event_wide__';

const STATION_TYPE_LABEL = {
  START: 'จุดสตาร์ท',
  CP: 'จุดตรวจ',
  FINISH: 'เส้นชัย',
};

function slotLabel(slot) {
  if (slot.station_id === null) return 'ทั้งงาน (ไม่ผูกจุด)';
  const kind = STATION_TYPE_LABEL[slot.station_type] || '';
  return [slot.station_name, kind && `(${kind})`].filter(Boolean).join(' ');
}

export default function StaffLogin() {
  const { signInWithPin, loading } = useAuth();

  // Step 1: pick the event and station/role slot the PIN belongs to.
  const [events, setEvents] = useState([]);
  const [slots, setSlots] = useState([]);
  const [eventId, setEventId] = useState('');
  const [stationValue, setStationValue] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');

  // Step 2: the PIN itself, entered only once a slot is chosen.
  const [step, setStep] = useState('select');
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Load the event list once, as soon as there is a connection.
  useEffect(() => {
    if (!isOnline) {
      setOptionsLoading(false);
      return;
    }
    let isActive = true;
    setOptionsLoading(true);
    setOptionsError('');
    fetchLoginEvents()
      .then((list) => {
        if (!isActive) return;
        setEvents(list);
      })
      .catch((err) => {
        console.error('Load login events failed:', err);
        if (isActive) setOptionsError('โหลดรายชื่องานวิ่งไม่สำเร็จ กรุณาลองใหม่');
      })
      .finally(() => {
        if (isActive) setOptionsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [isOnline]);

  // Load the station/role slots for whichever event is selected.
  useEffect(() => {
    if (!eventId) {
      setSlots([]);
      setStationValue('');
      return;
    }
    let isActive = true;
    setOptionsLoading(true);
    setOptionsError('');
    setStationValue('');
    fetchLoginSlots(eventId)
      .then((list) => {
        if (!isActive) return;
        setSlots(list);
      })
      .catch((err) => {
        console.error('Load login slots failed:', err);
        if (isActive) setOptionsError('โหลดรายชื่อจุดปฏิบัติงานไม่สำเร็จ กรุณาลองใหม่');
      })
      .finally(() => {
        if (isActive) setOptionsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [eventId]);

  const appendDigit = useCallback((digit) => {
    setErrorMsg('');
    setPin((prev) => (prev.length >= MAX_PIN_LENGTH ? prev : prev + digit));
  }, []);

  const removeDigit = useCallback(() => {
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const clearPin = useCallback(() => {
    setErrorMsg('');
    setPin('');
  }, []);

  const handleContinue = (e) => {
    e.preventDefault();
    if (!eventId || !stationValue) return;
    setErrorMsg('');
    setPin('');
    setStep('pin');
  };

  const handleBack = () => {
    setStep('select');
    setPin('');
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (pin.length < MIN_PIN_LENGTH) {
      setErrorMsg('กรุณากรอกรหัส PIN ให้ครบอย่างน้อย 4 หลัก');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    const stationId = stationValue === EVENT_WIDE_VALUE ? null : stationValue;
    const result = await signInWithPin({ eventId, stationId, pin });
    setIsSubmitting(false);

    if (!result.success) {
      setPin('');
      setErrorMsg(result.message);
    }
  };

  const isBusy = isSubmitting || loading;
  const selectedEvent = events.find((ev) => ev.id === eventId) || null;
  const selectedSlot = slots.find(
    (slot) => (slot.station_id === null ? EVENT_WIDE_VALUE : slot.station_id) === stationValue
  ) || null;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--bg-soft)',
      }}
    >
      <main
        className="card"
        style={{
          width: '100%',
          maxWidth: '400px',
          background: 'var(--bg)',
          padding: '28px 22px 26px',
        }}
      >
        <header style={{ textAlign: 'center', marginBottom: '18px' }}>
          <img src={logoRohnFull} alt="ROHN Logo" style={{ height: '80px', width: 'auto', margin: '0 auto 16px', display: 'block' }} />
          <h1 style={{ fontSize: '21px', fontWeight: 800, letterSpacing: '-0.01em' }}>
            เข้าสู่ระบบเจ้าหน้าที่
          </h1>
          <p style={{ fontSize: '13.5px', color: 'var(--ink-2)', marginTop: '6px' }}>
            {step === 'select'
              ? 'เลือกงานวิ่งและจุดปฏิบัติงานก่อนกรอกรหัส PIN'
              : 'กรอกรหัส PIN ประจำจุดที่ได้รับจากแอดมิน'}
          </p>
        </header>

        {!isOnline && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#92400e',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '14px',
            }}
          >
            <WifiOff size={16} />
            ตอนนี้ไม่มีสัญญาณอินเทอร์เน็ต — ต้องต่อเน็ตก่อนจึงจะเข้าสู่ระบบได้
          </div>
        )}

        {step === 'select' ? (
          <form onSubmit={handleContinue}>
            <label
              htmlFor="staff-event"
              style={{
                display: 'block',
                fontSize: '12.5px',
                fontWeight: 700,
                color: 'var(--ink-2)',
                marginBottom: '6px',
              }}
            >
              งานวิ่ง
            </label>
            <select
              id="staff-event"
              className="search"
              value={eventId}
              disabled={!isOnline || optionsLoading}
              onChange={(e) => setEventId(e.target.value)}
              style={{ width: '100%', marginBottom: '14px' }}
            >
              <option value="">
                {optionsLoading && !eventId ? 'กำลังโหลด…' : '— เลือกงานวิ่ง —'}
              </option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>

            <label
              htmlFor="staff-station"
              style={{
                display: 'block',
                fontSize: '12.5px',
                fontWeight: 700,
                color: 'var(--ink-2)',
                marginBottom: '6px',
              }}
            >
              จุดปฏิบัติงาน
            </label>
            <select
              id="staff-station"
              className="search"
              value={stationValue}
              disabled={!isOnline || !eventId || optionsLoading}
              onChange={(e) => setStationValue(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">
                {!eventId
                  ? 'เลือกงานวิ่งก่อน'
                  : optionsLoading
                  ? 'กำลังโหลด…'
                  : slots.length === 0
                  ? 'ไม่มีจุดที่เปิดใช้งาน PIN'
                  : '— เลือกจุดปฏิบัติงาน —'}
              </option>
              {slots.map((slot) => {
                const value = slot.station_id === null ? EVENT_WIDE_VALUE : slot.station_id;
                return (
                  <option key={value} value={value}>
                    {slotLabel(slot)}
                  </option>
                );
              })}
            </select>

            {optionsError && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: '#991b1b',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginTop: '14px',
                }}
              >
                <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{optionsError}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn"
              disabled={!isOnline || !eventId || !stationValue}
              style={{
                width: '100%',
                height: '58px',
                marginTop: '18px',
                fontSize: '17px',
                fontWeight: 700,
                borderRadius: '14px',
                opacity: !isOnline || !eventId || !stationValue ? 0.55 : 1,
                cursor: !isOnline || !eventId || !stationValue ? 'not-allowed' : 'pointer',
              }}
            >
              ถัดไป
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <button
              type="button"
              onClick={handleBack}
              disabled={isBusy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink-2)',
                background: 'none',
                border: 'none',
                padding: 0,
                marginBottom: '12px',
                cursor: isBusy ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={16} />
              เปลี่ยนงานวิ่ง/จุดปฏิบัติงาน
            </button>

            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink)',
                background: 'var(--bg-soft)',
                borderRadius: '10px',
                padding: '10px 12px',
                marginBottom: '14px',
              }}
            >
              {selectedEvent?.name} · {selectedSlot ? slotLabel(selectedSlot) : ''}
            </div>

            <label
              htmlFor="staff-pin"
              style={{
                display: 'block',
                fontSize: '12.5px',
                fontWeight: 700,
                color: 'var(--ink-2)',
                marginBottom: '6px',
              }}
            >
              รหัส PIN
            </label>
            <input
              id="staff-pin"
              className="search"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              value={pin}
              disabled={isBusy}
              onChange={(e) => {
                setErrorMsg('');
                setPin(e.target.value.replace(/\D/g, '').slice(0, MAX_PIN_LENGTH));
              }}
              style={{
                width: '100%',
                height: '62px',
                textAlign: 'center',
                fontSize: '30px',
                letterSpacing: '0.35em',
                fontFamily: 'var(--mono)',
                fontWeight: 700,
              }}
            />

            <PinKeypad
              onDigit={appendDigit}
              onBackspace={removeDigit}
              onClear={clearPin}
              disabled={isBusy}
            />

            {errorMsg && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: '#991b1b',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginTop: '16px',
                }}
              >
                <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn"
              disabled={isBusy || !isOnline}
              style={{
                width: '100%',
                height: '58px',
                marginTop: '18px',
                fontSize: '17px',
                fontWeight: 700,
                borderRadius: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: isBusy || !isOnline ? 0.55 : 1,
                cursor: isBusy || !isOnline ? 'not-allowed' : 'pointer',
              }}
            >
              <LogIn size={19} />
              {isSubmitting ? 'กำลังตรวจสอบรหัส…' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        )}

        <p
          style={{
            fontSize: '12px',
            color: 'var(--ink-2)',
            textAlign: 'center',
            marginTop: '16px',
            lineHeight: 1.6,
          }}
        >
          ลืมรหัส PIN หรือรหัสใช้ไม่ได้ ให้ติดต่อแอดมินประจำงาน
          <br />
          ห้ามใช้รหัสของเจ้าหน้าที่คนอื่น
        </p>
      </main>
    </div>
  );
}
