import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { roleLabel } from '../lib/roles';
import SignOutButton from './SignOutButton';

const PANEL_STYLE = {
  maxWidth: '520px',
  margin: '48px auto',
  padding: '28px',
  borderRadius: '14px',
  border: '1px solid var(--line)',
  background: 'var(--bg)',
  textAlign: 'center',
};

/**
 * Shown when the signed-in role may not open a route. The database would refuse
 * the action anyway; saying so up front keeps the UI honest.
 * @param {{ role?: string | null, landingPath?: string | null, title?: string, message?: string }} props
 */
export default function AccessDenied({ role, landingPath, title, message }) {
  return (
    <section style={PANEL_STYLE} aria-labelledby="access-denied-heading">
      <ShieldAlert size={38} style={{ color: '#b45309' }} />
      <h2 id="access-denied-heading" style={{ margin: '12px 0 8px', fontSize: '18px' }}>
        {title || 'ไม่มีสิทธิ์เข้าถึงหน้านี้'}
      </h2>
      <p style={{ margin: '0 0 20px', color: 'var(--ink-2)', lineHeight: 1.6, fontSize: '14px' }}>
        {message || `บัญชีของคุณมีบทบาท "${roleLabel(role)}" ซึ่งไม่ได้รับสิทธิ์ใช้งานหน้านี้ กรุณาติดต่อผู้ดูแลระบบหากคิดว่าไม่ถูกต้อง`}
      </p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {landingPath && (
          <Link
            to={landingPath}
            className="btn"
            style={{ padding: '8px 16px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
          >
            กลับไปหน้าหลักของคุณ
          </Link>
        )}
        <SignOutButton style={{ padding: '8px 16px', fontSize: '13px' }} />
      </div>
    </section>
  );
}
