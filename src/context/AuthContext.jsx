import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { pickPrimaryStaffRow } from '../lib/roles';

const AuthContext = createContext(null);

// User-facing copy is Thai and non-technical; the underlying error goes to the
// console only. Never surface a Supabase message straight to a marshal's phone.
const MESSAGES = {
  offline: 'ไม่มีสัญญาณอินเทอร์เน็ต — การเข้าสู่ระบบต้องต่อเน็ตก่อน',
  invalidPin: 'รหัส PIN ไม่ถูกต้อง หรือหมดอายุแล้ว กรุณาลองใหม่อีกครั้ง',
  badFormat: 'กรุณากรอกรหัส PIN ให้ครบ (4–12 หลัก)',
  missingSelection: 'กรุณาเลือกงานวิ่งและจุดปฏิบัติงานก่อนกรอกรหัส PIN',
  server: 'ระบบเข้าสู่ระบบขัดข้องชั่วคราว กรุณาลองใหม่ในอีกสักครู่',
};

const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 12;

function messageForError(error) {
  const code = error?.code || error?.error || '';
  if (code === 'invalid_credentials') return MESSAGES.invalidPin;
  if (code === 'invalid_request') return MESSAGES.badFormat;
  return MESSAGES.server;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  // The user id whose staff row has finished loading — success or failure alike.
  // Deriving the loading flag from it avoids a frame where a freshly signed-in
  // user looks like they have no staff record at all.
  const [staffLoadedFor, setStaffLoadedFor] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // A user can hold both a global and an event-scoped staff row. Fetch every row
  // in a stable order and resolve the effective one in code, so the role shown in
  // the UI is the same one the database will enforce.
  //
  // The status filter is not optional: private.current_staff_role() ignores any
  // row that is not ACTIVE, so without it a deactivated ADMIN row would still
  // render an admin UI while every admin action was refused by RLS.
  const loadStaff = useCallback(async (userId) => {
    if (!userId) {
      setStaff(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .order('id', { ascending: true });

      if (error) throw error;
      if (isMountedRef.current) setStaff(pickPrimaryStaffRow(data));
    } catch (err) {
      console.error('Load staff profile failed:', err);
      if (isMountedRef.current) setStaff(null);
    } finally {
      if (isMountedRef.current) setStaffLoadedFor(userId);
    }
  }, []);

  // Restore an existing session, then follow auth state for the rest of the run.
  useEffect(() => {
    let isActive = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isActive) return;
        setSession(data?.session || null);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Restore session failed:', err);
        if (!isActive) return;
        setSession(null);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isActive) return;
      setSession(nextSession || null);
    });

    return () => {
      isActive = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const sessionUserId = session?.user?.id || null;
  const staffLoading = Boolean(sessionUserId) && staffLoadedFor !== sessionUserId;

  useEffect(() => {
    if (!sessionUserId) {
      setStaff(null);
      setStaffLoadedFor(null);
      return;
    }
    loadStaff(sessionUserId);
  }, [sessionUserId, loadStaff]);

  // eventId is mandatory — it is what lets the server narrow a PIN check to
  // ~1 row instead of scanning every PIN in the database (see staff-login's
  // own header comment). stationId is three-valued and must be passed through
  // verbatim from the slot the operator picked: a uuid string for a specific
  // station, or the literal `null` for the event-wide slot (e.g. ADMIN) — never
  // omit the key once a slot has been chosen.
  const signInWithPin = useCallback(async ({ eventId, stationId, pin, staffName }) => {
    const trimmed = typeof pin === 'string' ? pin.trim() : '';
    if (trimmed.length < MIN_PIN_LENGTH || trimmed.length > MAX_PIN_LENGTH) {
      return { success: false, message: MESSAGES.badFormat };
    }
    if (typeof eventId !== 'string' || !eventId) {
      return { success: false, message: MESSAGES.missingSelection };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { success: false, message: MESSAGES.offline };
    }

    try {
      const { data, error } = await supabase.functions.invoke('staff-login', {
        body: {
          event_id: eventId,
          station_id: stationId ?? null,
          pin: trimmed,
          staffName: staffName || undefined,
        },
      });

      if (error) {
        // Non-2xx responses arrive as FunctionsHttpError; read the JSON body
        // so a wrong PIN is not reported as a server outage.
        let payload = null;
        if (typeof error.context?.json === 'function') {
          payload = await error.context.json().catch(() => null);
        }
        console.error('staff-login invoke failed:', error);
        return { success: false, message: messageForError(payload) };
      }

      if (!data?.token_hash) {
        console.error('staff-login returned no token_hash');
        return { success: false, message: MESSAGES.server };
      }

      const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'email',
      });

      if (verifyError) {
        console.error('verifyOtp failed:', verifyError);
        return { success: false, message: MESSAGES.server };
      }

      const nextSession = verified?.session || null;
      setSession(nextSession);

      return {
        success: true,
        assignment: {
          eventId: data.event_id ?? null,
          stationId: data.station_id ?? null,
          role: data.role ?? null,
          label: data.label ?? null,
        },
      };
    } catch (err) {
      console.error('Sign in with PIN failed:', err);
      return { success: false, message: MESSAGES.server };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error('Sign out failed:', err);
      return { success: false, message: MESSAGES.server };
    } finally {
      setSession(null);
      setStaff(null);
      setStaffLoadedFor(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        staff,
        role: staff?.role || null,
        loading,
        staffLoading,
        signInWithPin,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
