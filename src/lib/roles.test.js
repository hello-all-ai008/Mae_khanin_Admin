import { describe, expect, test } from 'vitest';
import { ROLES, canAccessRoute, landingRouteFor, pickPrimaryStaffRow, roleLabel } from './roles';

// The authoritative ladder, strongest first. It mirrors the `order by case
// s.role when ...` block of private.current_staff_role() in
// supabase/migrations/20260828100200_create_private_auth_helpers.sql.
// If this array and that SQL ever disagree, the UI grants or withholds actions
// the database resolves differently — which is exactly the bug this pins.
const LADDER = [
  ROLES.ADMIN,
  ROLES.CHECKIN_CREW,
  ROLES.FINISH_JUDGE,
  ROLES.MARSHAL,
  ROLES.VOLUNTEER,
];

// Every ordered pair (stronger, weaker) from the ladder.
const PAIRS = LADDER.flatMap((stronger, i) =>
  LADDER.slice(i + 1).map((weaker) => ({ stronger, weaker }))
);

describe('pickPrimaryStaffRow — role precedence', () => {
  // Status is NOT filtered here by design: private.current_staff_role() only
  // considers `status = 'ACTIVE'` rows, and the caller narrows the query the
  // same way (AuthContext.loadStaff uses .eq('status', 'ACTIVE')). So there is
  // no INACTIVE case to assert on this function.

  test.each(PAIRS)('$stronger outranks $weaker', ({ stronger, weaker }) => {
    // Arrange: give the STRONGER row the larger id, so the id tie-break cannot
    // be the reason it wins.
    const strongRow = { id: '9', role: stronger };
    const weakRow = { id: '1', role: weaker };

    // Act
    const strongFirst = pickPrimaryStaffRow([strongRow, weakRow]);
    const weakFirst = pickPrimaryStaffRow([weakRow, strongRow]);

    // Assert: array order must not matter
    expect(strongFirst.role).toBe(stronger);
    expect(weakFirst.role).toBe(stronger);
  });

  test('resolves a CHECKIN_CREW + FINISH_JUDGE holder to CHECKIN_CREW, like the database does', () => {
    // Arrange: the exact pair the client used to rank the wrong way round,
    // which locked a real check-in operator out of /checkin.
    const rows = [
      { id: 'b', role: ROLES.FINISH_JUDGE },
      { id: 'a', role: ROLES.CHECKIN_CREW },
    ];

    // Act
    const primary = pickPrimaryStaffRow(rows);

    // Assert
    expect(primary.role).toBe(ROLES.CHECKIN_CREW);
    expect(canAccessRoute(primary.role, '/checkin')).toBe(true);
  });

  test('breaks a tie between equal roles on the row id, so repeated runs agree', () => {
    const rows = [
      { id: 'b2', role: ROLES.MARSHAL },
      { id: 'a1', role: ROLES.MARSHAL },
    ];

    expect(pickPrimaryStaffRow(rows).id).toBe('a1');
    expect(pickPrimaryStaffRow([...rows].reverse()).id).toBe('a1');
  });

  test('ranks an unknown role below every known role', () => {
    const rows = [
      { id: '1', role: 'SOMETHING_ELSE' },
      { id: '2', role: ROLES.VOLUNTEER },
    ];

    expect(pickPrimaryStaffRow(rows).role).toBe(ROLES.VOLUNTEER);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty array', []],
    ['a non-array', { role: ROLES.ADMIN }],
  ])('returns null for %s', (_label, input) => {
    expect(pickPrimaryStaffRow(input)).toBeNull();
  });
});

describe('canAccessRoute', () => {
  test('lets ADMIN open an admin-only route', () => {
    expect(canAccessRoute(ROLES.ADMIN, '/staff')).toBe(true);
    expect(canAccessRoute(ROLES.ADMIN, '/events')).toBe(true);
  });

  test('refuses VOLUNTEER on an admin-only route', () => {
    expect(canAccessRoute(ROLES.VOLUNTEER, '/staff')).toBe(false);
    expect(canAccessRoute(ROLES.VOLUNTEER, '/events')).toBe(false);
  });

  test('denies an unknown role rather than granting it', () => {
    expect(canAccessRoute('SUPER_ADMIN', '/staff')).toBe(false);
    // '/log' is open to every known role — an unknown one still must not pass.
    expect(canAccessRoute('SUPER_ADMIN', '/log')).toBe(false);
  });

  test.each([null, undefined, ''])('denies a missing role (%s)', (role) => {
    expect(canAccessRoute(role, '/log')).toBe(false);
  });

  test('denies an unknown path for every role', () => {
    LADDER.forEach((role) => {
      expect(canAccessRoute(role, '/not-a-route')).toBe(false);
    });
  });

  test('gates the scanning routes to the roles that own them', () => {
    expect(canAccessRoute(ROLES.CHECKIN_CREW, '/checkin')).toBe(true);
    expect(canAccessRoute(ROLES.FINISH_JUDGE, '/checkin')).toBe(false);
    expect(canAccessRoute(ROLES.MARSHAL, '/checkpoint')).toBe(true);
    expect(canAccessRoute(ROLES.FINISH_JUDGE, '/finish')).toBe(true);
    expect(canAccessRoute(ROLES.MARSHAL, '/finish')).toBe(false);
  });
});

describe('landingRouteFor', () => {
  test.each(LADDER)('gives %s a reachable landing route', (role) => {
    const path = landingRouteFor(role);
    expect(path).toBeTruthy();
    expect(canAccessRoute(role, path)).toBe(true);
  });

  test.each([null, undefined, 'SUPER_ADMIN'])('returns null for %s', (role) => {
    expect(landingRouteFor(role)).toBeNull();
  });
});

describe('roleLabel', () => {
  test.each(LADDER)('labels %s in Thai', (role) => {
    expect(roleLabel(role)).not.toBe('ไม่ระบุบทบาท');
  });

  test('falls back for an unknown role', () => {
    expect(roleLabel('SUPER_ADMIN')).toBe('ไม่ระบุบทบาท');
    expect(roleLabel(null)).toBe('ไม่ระบุบทบาท');
  });
});
