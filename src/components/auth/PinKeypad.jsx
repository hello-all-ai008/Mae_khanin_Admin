import { Delete } from 'lucide-react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const keyStyle = {
  height: '68px',
  fontSize: '26px',
  fontWeight: 700,
  fontFamily: 'var(--mono)',
  color: 'var(--ink)',
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: '14px',
  touchAction: 'manipulation',
  transition: 'background .12s ease, transform .06s ease',
};

const utilKeyStyle = {
  ...keyStyle,
  fontSize: '15px',
  fontFamily: 'var(--sans)',
  background: 'var(--bg-soft)',
  color: 'var(--ink-2)',
};

/**
 * Large-target numeric keypad. Used one-handed, in the dark, often with gloves —
 * every hit area is at least 68px tall.
 */
export default function PinKeypad({ onDigit, onBackspace, onClear, disabled = false }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px',
        marginTop: '18px',
      }}
    >
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onDigit(key)}
          aria-label={`เลข ${key}`}
          style={{ ...keyStyle, opacity: disabled ? 0.5 : 1 }}
        >
          {key}
        </button>
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        aria-label="ล้างรหัสทั้งหมด"
        style={{ ...utilKeyStyle, opacity: disabled ? 0.5 : 1 }}
      >
        ล้าง
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onDigit('0')}
        aria-label="เลข 0"
        style={{ ...keyStyle, opacity: disabled ? 0.5 : 1 }}
      >
        0
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={onBackspace}
        aria-label="ลบหนึ่งหลัก"
        style={{
          ...utilKeyStyle,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Delete size={22} />
      </button>
    </div>
  );
}
