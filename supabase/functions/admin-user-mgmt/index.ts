import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { corsHeaders } from "./cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Ensure the caller is an ADMIN
    const { data: staffData, error: staffError } = await supabaseClient
      .from("staff")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "ADMIN")
      .single();

    if (staffError || !staffData) {
      return new Response(JSON.stringify({ error: "Forbidden: Admins only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------------------------------------------
    // GET: List all staff + check if they have a PIN
    // ---------------------------------------------
    if (req.method === "GET") {
      const url = new URL(req.url);
      const eventId = url.searchParams.get("event_id");

      // staff.user_id and event_pins.auth_user_id both reference
      // auth.users.id independently — neither table has a foreign key to
      // the other, so PostgREST can't embed event_pins under staff in one
      // query. Fetch both and join them here instead.
      let query = supabaseClient.from("staff").select("*");
      if (eventId) {
        query = query.or(`event_id.eq.${eventId},event_id.is.null`);
      }

      const { data: allStaff, error: allStaffError } = await query.order('name', { ascending: true });
      if (allStaffError) throw allStaffError;

      const userIds = [...new Set((allStaff || []).map((s) => s.user_id).filter(Boolean))];
      let pinsByUserId: Record<string, unknown[]> = {};
      if (userIds.length > 0) {
        const { data: pins, error: pinsError } = await supabaseClient
          .from("event_pins")
          .select("id, active, event_id, station_id, auth_user_id")
          .in("auth_user_id", userIds);
        if (pinsError) throw pinsError;
        pinsByUserId = (pins || []).reduce((acc, pin) => {
          (acc[pin.auth_user_id] ||= []).push(pin);
          return acc;
        }, {} as Record<string, unknown[]>);
      }

      const staffWithPins = (allStaff || []).map((s) => ({
        ...s,
        event_pins: pinsByUserId[s.user_id] || [],
      }));

      return new Response(JSON.stringify(staffWithPins), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------------------------------------------
    // POST: Create new Staff + PIN + Auth User
    // ---------------------------------------------
    if (req.method === "POST") {
      const body = await req.json();
      const { name, role, phone, station_id, status, is_global, event_id, pin } = body;

      if (!name || !role || !pin || !event_id) {
        return new Response(JSON.stringify({ error: "Missing required fields (name, role, pin, event_id)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 1. Create dummy auth.users account
      const fakeEmail = `staff-${crypto.randomUUID().split('-')[0]}@trailtime.local`;
      const { data: authData, error: createAuthError } = await supabaseClient.auth.admin.createUser({
        email: fakeEmail,
        password: crypto.randomUUID(),
        email_confirm: true
      });
      
      if (createAuthError || !authData.user) throw createAuthError;
      const newUserId = authData.user.id;

      // 2. Hash PIN and insert into event_pins
      const pinHash = bcrypt.hashSync(pin, 10);
      const { error: pinError } = await supabaseClient.from("event_pins").insert({
        event_id: event_id,
        station_id: station_id || null,
        role: role,
        label: name,
        pin_hash: pinHash,
        auth_user_id: newUserId,
        active: status === 'ACTIVE'
      });

      if (pinError) {
        await supabaseClient.auth.admin.deleteUser(newUserId);
        throw pinError;
      }

      // 3. Create staff record
      const { data: newStaff, error: staffInsertError } = await supabaseClient.from("staff").insert({
        user_id: newUserId,
        event_id: is_global ? null : event_id,
        station_id: station_id || null,
        name: name,
        phone: phone || null,
        role: role,
        status: status
      }).select().single();

      if (staffInsertError) {
        await supabaseClient.auth.admin.deleteUser(newUserId);
        throw staffInsertError;
      }

      return new Response(JSON.stringify({ success: true, data: newStaff }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------------------------------------------
    // PUT: Update Staff and optionally PIN
    // ---------------------------------------------
    if (req.method === "PUT") {
      const body = await req.json();
      const { id, user_id, name, role, phone, station_id, status, is_global, event_id, pin } = body;

      if (!id || !user_id) {
        return new Response(JSON.stringify({ error: "Missing staff id or user_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Update staff record
      const { error: staffUpdateError } = await supabaseClient.from("staff").update({
        event_id: is_global ? null : event_id,
        station_id: station_id || null,
        name: name,
        phone: phone || null,
        role: role,
        status: status
      }).eq("id", id);

      if (staffUpdateError) throw staffUpdateError;

      // Update event_pins active status and label
      const { error: pinUpdateError } = await supabaseClient.from("event_pins").update({
        active: status === 'ACTIVE',
        label: name,
        station_id: station_id || null,
        role: role
      }).eq("auth_user_id", user_id);

      if (pinUpdateError) throw pinUpdateError;

      // Update PIN if provided
      if (pin) {
        const pinHash = bcrypt.hashSync(pin, 10);
        const { error: hashUpdateError } = await supabaseClient.from("event_pins").update({
          pin_hash: pinHash
        }).eq("auth_user_id", user_id);
        
        if (hashUpdateError) throw hashUpdateError;
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------------------------------------------
    // DELETE: Remove Staff (deletes auth.user which cascades)
    // ---------------------------------------------
    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const user_id = url.searchParams.get("user_id");

      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id parameter" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Deleting the auth.users record will cascade and delete event_pins and staff records
      const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(user_id);
      
      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Admin User Mgmt Error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
