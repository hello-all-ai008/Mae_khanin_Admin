// Staff roles, route permissions, and deterministic role selection.
//
// The database enforces the real permissions through RLS; this module only keeps
// the UI honest so a marshal is never offered an action the server will refuse.

export const ROLES = {
  ADMIN: 'ADMIN',
  CHECKIN_CREW: 'CHECKIN_CREW',
  MARSHAL: 'MARSHAL',
  FINISH_JUDGE: 'FINISH_JUDGE',
  VOLUNTEER: 'VOLUNTEER',
};

// Higher wins. A user holding both a global and an event-scoped staff row must
// display the strongest role so the UI matches what the database enforces.
//
// THIS LADDER MUST STAY IN LOCKSTEP WITH THE DATABASE.
// The authoritative order lives in the `order by case s.role when ...` block of
// private.current_staff_role(), in
// supabase/migrations/20260828100200_create_private_auth_helpers.sql.
// That block ranks 0 = strongest: ADMIN 0, CHECKIN_CREW 1, FINISH_JUDGE 2,
// MARSHAL 3, VOLUNTEER 4. The numbers below count the other way (higher wins),
// but the resulting ORDER must be identical:
//   ADMIN > CHECKIN_CREW > FINISH_JUDGE > MARSHAL > VOLUNTEER
// Disagreeing with the SQL means the UI shows a role the server will not honour
// — e.g. a CHECKIN_CREW displayed as FINISH_JUDGE is locked out of /checkin
// while the database would happily authorise them there.
// Change one side and you must change the other; roles.test.js pins the order.
const ROLE_PRIORITY = {
  [ROLES.ADMIN]: 5,
  [ROLES.CHECKIN_CREW]: 4,
  [ROLES.FINISH_JUDGE]: 3,
  [ROLES.MARSHAL]: 2,
  [ROLES.VOLUNTEER]: 1,
};

const ROLE_LABELS = {
  [ROLES.ADMIN]: 'ผู้ดูแลระบบ',
  [ROLES.CHECKIN_CREW]: 'เจ้าหน้าที่จุดสตาร์ท',
  [ROLES.MARSHAL]: 'Marshal จุดตรวจ',
  [ROLES.FINISH_JUDGE]: 'กรรมการเส้นชัย',
  [ROLES.VOLUNTEER]: 'อาสาสมัคร',
};

const ADMIN_ONLY = [ROLES.ADMIN];
const EVERY_ROLE = Object.values(ROLES);

// Route path -> roles allowed to open it.
export const ROUTE_ACCESS = {
  '/dashboard': ADMIN_ONLY,
  '/leaderboard': ADMIN_ONLY,
  '/events': ADMIN_ONLY,
  '/staff': ADMIN_ONLY,
  '/runners': ADMIN_ONLY,
  '/import': ADMIN_ONLY,
  '/bib-canvas': ADMIN_ONLY,
  '/database-flow': ADMIN_ONLY,
  '/admin/users': ADMIN_ONLY,
  '/checkin': [ROLES.ADMIN, ROLES.CHECKIN_CREW],
  '/checkpoint': [ROLES.ADMIN, ROLES.MARSHAL],
  '/finish': [ROLES.ADMIN, ROLES.FINISH_JUDGE],
  '/log': EVERY_ROLE,
};

// First reachable route per role, used for "/" and for redirecting away from
// a route the signed-in role may not open.
const LANDING_ROUTE = {
  [ROLES.ADMIN]: '/events',
  [ROLES.CHECKIN_CREW]: '/checkin',
  [ROLES.MARSHAL]: '/checkpoint',
  [ROLES.FINISH_JUDGE]: '/finish',
  [ROLES.VOLUNTEER]: '/log',
};

/**
 * @param {string | null | undefined} role
 * @returns {number}
 */
function priorityOf(role) {
  return ROLE_PRIORITY[role] || 0;
}

/**
 * @param {string | null | undefined} role
 * @returns {string}
 */
export function roleLabel(role) {
  return ROLE_LABELS[role] || 'ไม่ระบุบทบาท';
}

/**
 * @param {string | null | undefined} role
 * @param {string} path
 * @returns {boolean}
 */
export function canAccessRoute(role, path) {
  if (!role) return false;
  const allowed = ROUTE_ACCESS[path];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * @param {string | null | undefined} role
 * @returns {string | null} the route to land on, or null when the role has none
 */
export function landingRouteFor(role) {
  if (!role) return null;
  return LANDING_ROUTE[role] || null;
}

/**
 * Picks the staff row whose role the database will actually enforce: the
 * strongest role wins, with the row id as a stable tie-break so two runs of the
 * app never disagree.
 *
 * STATUS IS NOT FILTERED HERE. private.current_staff_role() only considers rows
 * with `status = 'ACTIVE'`, so the caller must narrow the query the same way
 * (AuthContext.loadStaff does this with `.eq('status', 'ACTIVE')`). Filtering
 * again here would only hide the mistake if a future caller forgets.
 * @param {Array<{ id?: string, role?: string }> | null | undefined} rows already restricted to ACTIVE rows
 * @returns {object | null}
 */
export function pickPrimaryStaffRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.reduce((best, row) => {
    if (!best) return row;
    const diff = priorityOf(row.role) - priorityOf(best.role);
    if (diff > 0) return row;
    if (diff < 0) return best;
    return String(row.id) < String(best.id) ? row : best;
  }, null);
}
