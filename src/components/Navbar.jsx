import { Fragment, useState } from 'react';
import { NavLink } from 'react-router-dom';
import logoRohnPic from '../LOGO/logo-rohn-pic.png';
import logoRohnLabel from '../LOGO/logo-rohn-label.png';
import {
  Users,
  UserPlus,
  UserCheck,
  History,
  PenTool,
  Database,
  CalendarDays,
  Menu,
  X,
  ChevronDown,
  LayoutDashboard,
  Trophy
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canAccessRoute, roleLabel } from '../lib/roles';
import SignOutButton from './SignOutButton';

// Nav structure lives in data so the desktop bar, the mobile menu, and the role
// filter cannot drift apart. Access itself is defined once in lib/roles.js.
const NAV_GROUPS = [
  {
    id: 'overview',
    title: 'MAIN MENU',
    items: [
      { to: '/events', label: 'จัดการงานวิ่ง', mobileLabel: 'จัดการงานวิ่ง', Icon: CalendarDays },
      { to: '/staff', label: 'คนสแกน/จนท.', mobileLabel: 'คนสแกน/เจ้าหน้าที่', Icon: UserCheck },
      { to: '/admin/users', label: 'จัดการ User', mobileLabel: 'จัดการ User', Icon: Users },
      { to: '/runners', label: 'นักวิ่ง', mobileLabel: 'รายชื่อนักวิ่ง', Icon: Users },
      { to: '/import', label: 'นำเข้านักวิ่ง', mobileLabel: 'นำเข้านักวิ่ง', Icon: UserPlus },
    ],
  },
  {
    id: 'tools',
    title: 'TOOLS & LOGS',
    items: [
      { to: '/log', label: 'Scan Log', mobileLabel: 'Scan Log', Icon: History },
      { to: '/bib-canvas', label: 'BIB Canvas', mobileLabel: 'BIB Canvas Editor', Icon: PenTool },
      { to: '/database-flow', label: 'DB Flow', mobileLabel: 'Database Flow', Icon: Database },
    ],
  },
  {
    id: 'summary',
    title: 'สรุปผล',
    items: [
      { to: '/dashboard', label: 'สรุปผลทั้งหมด', mobileLabel: 'สรุปผลทั้งหมด', Icon: LayoutDashboard },
      { to: '/leaderboard', label: 'Live Leaderboard', mobileLabel: 'Live Leaderboard', Icon: Trophy },
    ],
  },
  {
    id: 'stations',
    title: 'SCAN STATIONS',
    items: [
      { to: '/checkin', label: 'Start', mobileLabel: 'Check-in (Start)', dotColor: 'var(--start)' },
      { to: '/checkpoint', label: 'CP', mobileLabel: 'Check Point', dotColor: 'var(--cp)' },
      { to: '/finish', label: 'Finish', mobileLabel: 'Finish Line', dotColor: 'var(--finish)' },
    ],
  },
];

const SECTION_HEADER_STYLE = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--ink-2)',
  letterSpacing: '0.05em',
};

const DOT_STYLE = { width: 10, height: 10, borderRadius: '50%' };

function visibleGroups(role) {
  return NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => canAccessRoute(role, item.to)),
  })).filter(group => group.items.length > 0);
}

export default function Navbar() {
  const { staff, role } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [isOverviewDropdownOpen, setIsOverviewDropdownOpen] = useState(false);
  const [isSummaryDropdownOpen, setIsSummaryDropdownOpen] = useState(false);

  const toggleMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };

  const closeMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const groups = visibleGroups(role);

  return (
    <>
      <nav className="navbar">
        <div className="navbar-left">
          <div className="logo">
            <img src={logoRohnPic} alt="ROHN" style={{ height: '100px', width: 'auto', zIndex: 2 }} />
            <img src={logoRohnLabel} alt="ROHN Label" style={{ height: '75px', width: 'auto', marginLeft: '-16px' }} className="hide-mobile" />
          </div>
        </div>

        {/* Desktop Navbar Center */}
        <div className="navbar-center">
          {groups.map((group, index) => (
            <Fragment key={group.id}>
              {index > 0 && <div className="nav-divider"></div>}
              {group.id === 'summary' ? (
                <div
                  className="nav-group-horizontal"
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setIsSummaryDropdownOpen(true)}
                  onMouseLeave={() => setIsSummaryDropdownOpen(false)}
                >
                  <div
                    className={`nav-item-h ${isSummaryDropdownOpen ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setIsSummaryDropdownOpen(!isSummaryDropdownOpen)}
                  >
                    <LayoutDashboard size={16} />
                    <span className="label">สรุปผล</span>
                    <ChevronDown size={14} />
                  </div>
                  {isSummaryDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px',
                      padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px',
                      minWidth: '160px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 110
                    }}>
                      {group.items.map(({ to, label, Icon, dotColor }) => (
                        <NavLink key={to} to={to} className={({ isActive }) => `nav-item-h ${isActive ? 'active' : ''}`} onClick={() => setIsSummaryDropdownOpen(false)}>
                          {Icon ? <Icon size={16} /> : <span className="dot" style={{ background: dotColor }}></span>}
                          <span className="label">{label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : group.id === 'tools' ? (
                <div
                  className="nav-group-horizontal"
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setIsToolsDropdownOpen(true)}
                  onMouseLeave={() => setIsToolsDropdownOpen(false)}
                >
                  <div
                    className={`nav-item-h ${isToolsDropdownOpen ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setIsToolsDropdownOpen(!isToolsDropdownOpen)}
                  >
                    <Database size={16} />
                    <span className="label">เครื่องมือระบบ</span>
                    <ChevronDown size={14} />
                  </div>
                  {isToolsDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px',
                      padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px',
                      minWidth: '160px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 110
                    }}>
                      {group.items.map(({ to, label, Icon, dotColor }) => (
                        <NavLink key={to} to={to} className={({ isActive }) => `nav-item-h ${isActive ? 'active' : ''}`} onClick={() => setIsToolsDropdownOpen(false)}>
                          {Icon ? <Icon size={16} /> : <span className="dot" style={{ background: dotColor }}></span>}
                          <span className="label">{label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : group.id === 'overview' ? (
                <div
                  className="nav-group-horizontal"
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setIsOverviewDropdownOpen(true)}
                  onMouseLeave={() => setIsOverviewDropdownOpen(false)}
                >
                  <div
                    className={`nav-item-h ${isOverviewDropdownOpen ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setIsOverviewDropdownOpen(!isOverviewDropdownOpen)}
                  >
                    <CalendarDays size={16} />
                    <span className="label">จัดการข้อมูล</span>
                    <ChevronDown size={14} />
                  </div>
                  {isOverviewDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px',
                      padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px',
                      minWidth: '160px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 110
                    }}>
                      {group.items.map(({ to, label, Icon, dotColor }) => (
                        <NavLink key={to} to={to} className={({ isActive }) => `nav-item-h ${isActive ? 'active' : ''}`} onClick={() => setIsOverviewDropdownOpen(false)}>
                          {Icon ? <Icon size={16} /> : <span className="dot" style={{ background: dotColor }}></span>}
                          <span className="label">{label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="nav-group-horizontal">
                  {group.items.map(({ to, label, Icon, dotColor }) => (
                    <NavLink key={to} to={to} className={({ isActive }) => `nav-item-h ${isActive ? 'active' : ''}`}>
                      {Icon ? <Icon size={16} /> : <span className="dot" style={{ background: dotColor }}></span>}
                      <span className="label">{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </Fragment>
          ))}
        </div>

        {/* Signed-in identity + sign-out (desktop) */}
        <div className="navbar-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            title="บัญชีที่กำลังเข้าสู่ระบบ"
            style={{ fontSize: '12px', color: 'var(--ink-2)', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            👤 {staff?.name || '—'} · {roleLabel(role)}
          </span>
          <SignOutButton />
        </div>

        {/* Mobile Hamburger Button */}
        <div className="navbar-mobile-toggle">
          <button className="btn-icon" onClick={toggleMenu} style={{ border: 'none', background: 'transparent' }}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div className={`mobile-menu-overlay ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-menu-content">
          {groups.map((group, index) => (
            <div key={group.id}>
              {index > 0 && <div className="mobile-menu-divider"></div>}
              <div className="mobile-menu-header">
                <span style={SECTION_HEADER_STYLE}>{group.title}</span>
              </div>
              {group.items.map(({ to, mobileLabel, Icon, dotColor }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
                  onClick={closeMenu}
                >
                  {Icon ? <Icon size={18} /> : <span className="dot" style={{ background: dotColor, ...DOT_STYLE }}></span>}
                  {' '}{mobileLabel}
                </NavLink>
              ))}
            </div>
          ))}

          <div className="mobile-menu-divider"></div>

          <div className="mobile-menu-header">
            <span style={SECTION_HEADER_STYLE}>บัญชีผู้ใช้งาน</span>
          </div>
          <div style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: 'var(--ink-2)', fontWeight: 600 }}>
              👤 {staff?.name || '—'} · {roleLabel(role)}
            </span>
            <SignOutButton onDone={closeMenu} style={{ padding: '8px 14px', fontSize: '13px' }} />
          </div>
        </div>
      </div>
    </>
  );
}
