export default function LedBoard({ runner, message, warn = false }) {
  return (
    <div>
      <div className={`led ${warn ? 'flash-warn' : (runner ? 'flash-ok' : '')}`}>
        {runner ? (
          <>
            <div className="bib">{runner.bib}</div>
            <div className="name">{runner.name.toUpperCase()}</div>
            <div className="meta">{runner.nat} · {runner.age} · {runner.cat}</div>
            {message && <div className={`time ${warn ? 'meta-warn' : ''}`}>{message}</div>}
          </>
        ) : (
          <div className="idle">— รอการสแกน —</div>
        )}
      </div>
      <div className="led-caption">แสดงผลบน Monitor / Tablet / Mobile</div>
    </div>
  );
}
