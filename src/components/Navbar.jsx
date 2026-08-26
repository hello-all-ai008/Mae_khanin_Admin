import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Users, 
  UserPlus, 
  UserCheck,
  History, 
  PenTool,
  Database,
  CalendarDays,
  Menu,
  X
} from 'lucide-react';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-left">
          <div className="logo">
            <div className="logo-mark">TT</div>
            <div><b>TrailTime</b><span>Race Timing System</span></div>
          </div>
        </div>
        
        {/* Desktop Navbar Center */}
        <div className="navbar-center">
          {/* ภาพรวม */}
          <div className="nav-group-horizontal">
            <NavLink to="/events" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <CalendarDays size={16} />
              <span className="label">จัดการงานวิ่ง</span>
            </NavLink>
            <NavLink to="/staff" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <UserCheck size={16} />
              <span className="label">คนสแกน/จนท.</span>
            </NavLink>
            <NavLink to="/runners" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <Users size={16} />
              <span className="label">นักวิ่ง</span>
            </NavLink>
            <NavLink to="/import" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <UserPlus size={16} />
              <span className="label">นำเข้านักวิ่ง</span>
            </NavLink>
          </div>

          <div className="nav-divider"></div>

          {/* จุดสแกน */}
          <div className="nav-group-horizontal">
            <NavLink to="/checkin" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <span className="dot" style={{background: 'var(--start)'}}></span>
              <span className="label">Start</span>
            </NavLink>
            <NavLink to="/checkpoint" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <span className="dot" style={{background: 'var(--cp)'}}></span>
              <span className="label">CP</span>
            </NavLink>
            <NavLink to="/finish" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <span className="dot" style={{background: 'var(--finish)'}}></span>
              <span className="label">Finish</span>
            </NavLink>
          </div>

          <div className="nav-divider"></div>

          {/* รายงาน & Tools */}
          <div className="nav-group-horizontal">
            <NavLink to="/log" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <History size={16} />
              <span className="label">Scan Log</span>
            </NavLink>
            <NavLink to="/bib-canvas" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <PenTool size={16} />
              <span className="label">BIB Canvas</span>
            </NavLink>
            <NavLink to="/database-flow" className={({isActive}) => `nav-item-h ${isActive ? 'active' : ''}`}>
              <Database size={16} />
              <span className="label">DB Flow</span>
            </NavLink>
          </div>
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
          <div className="mobile-menu-header">
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-2)', letterSpacing: '0.05em' }}>MAIN MENU</span>
          </div>
          
          <NavLink to="/events" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <CalendarDays size={18} /> จัดการงานวิ่ง
          </NavLink>
          <NavLink to="/staff" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <UserCheck size={18} /> คนสแกน/เจ้าหน้าที่
          </NavLink>
          <NavLink to="/runners" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <Users size={18} /> รายชื่อนักวิ่ง
          </NavLink>
          <NavLink to="/import" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <UserPlus size={18} /> นำเข้านักวิ่ง
          </NavLink>

          <div className="mobile-menu-divider"></div>
          
          <div className="mobile-menu-header">
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-2)', letterSpacing: '0.05em' }}>SCAN STATIONS</span>
          </div>

          <NavLink to="/checkin" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <span className="dot" style={{background: 'var(--start)', width: 10, height: 10, borderRadius: '50%'}}></span> Check-in (Start)
          </NavLink>
          <NavLink to="/checkpoint" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <span className="dot" style={{background: 'var(--cp)', width: 10, height: 10, borderRadius: '50%'}}></span> Check Point
          </NavLink>
          <NavLink to="/finish" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <span className="dot" style={{background: 'var(--finish)', width: 10, height: 10, borderRadius: '50%'}}></span> Finish Line
          </NavLink>

          <div className="mobile-menu-divider"></div>

          <div className="mobile-menu-header">
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-2)', letterSpacing: '0.05em' }}>TOOLS & LOGS</span>
          </div>

          <NavLink to="/log" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <History size={18} /> Scan Log
          </NavLink>
          <NavLink to="/bib-canvas" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <PenTool size={18} /> BIB Canvas Editor
          </NavLink>
          <NavLink to="/database-flow" className={({isActive}) => `mobile-nav-item ${isActive ? 'active' : ''}`} onClick={closeMenu}>
            <Database size={18} /> Database Flow
          </NavLink>
        </div>
      </div>
    </>
  );
}
