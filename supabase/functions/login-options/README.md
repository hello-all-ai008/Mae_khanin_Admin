# `login-options` Edge Function

Label-only directory for the staff login screen, called **before** anyone is
authenticated. It lets the operator pick the event and the station/role slot
first; [`staff-login`](../staff-login/README.md) then verifies the PIN against
just that slot.

It exists so that `public.event_pins` can stay exactly as it is: RLS enabled,
**no policies**, **no grants** to `anon` or `authenticated`. This function runs
with the service role and returns names only. It never selects `pin_hash`,
`auth_user_id`, `failed_attempts` or `locked_until`, and it knows nothing about
PIN values.

## Contract

### List events

`GET /functions/v1/login-options`

Returns the events that have at least one active, unexpired PIN.

```json
{
  "events": [
    {
      "id": "8f1c…",
      "name": "Mae Kha Nin Trail 2026",
      "start_date": "2026-09-12",
      "end_date": "2026-09-12",
      "status": "PUBLISHED"
    }
  ]
}
```

### List slots for an event

`GET /functions/v1/login-options?event_id=8f1c…`

```json
{
  "event_id": "8f1c…",
  "slots": [
    {
      "station_id": "3ab9…",
      "station_name": "CP2 Mae Kha Nin",
      "station_type": "CP",
      "sequence_order": 2,
      "roles": ["MARSHAL"]
    },
    {
      "station_id": null,
      "station_name": null,
      "station_type": null,
      "sequence_order": null,
      "roles": ["ADMIN"]
    }
  ]
}
```

- Stations come back in `sequence_order`; the event-wide slot
  (`station_id: null`) is always last.
- `roles` lists the distinct roles that have a PIN for that slot. Render it as a
  label — it is not an authorisation claim.
- Pass the chosen `station_id` **verbatim** to `staff-login`, including the
  literal `null` for the event-wide slot. Omitting the key means something
  different there (see that README).
- An unknown `event_id` returns `{ "event_id": …, "slots": [] }`, not an error:
  this endpoint does not confirm which ids exist.

### Errors

| Status | Body | Meaning |
| --- | --- | --- |
| `400` | `{ "error": "invalid_request" }` | `event_id` present but not a uuid |
| `405` | `{ "error": "method_not_allowed" }` | Anything other than `GET` (or the `OPTIONS` preflight) |
| `500` | `{ "error": "server_error" }` | Misconfiguration or internal error |

Responses are `Cache-Control: no-store` and CORS is the same env-driven
allow-list as `staff-login` (`STAFF_LOGIN_ALLOWED_ORIGIN`), never `*`.

## Disclosure note

A slot listed here proves only that a PIN exists for that station — the same
thing the printed station roster tells anyone on site. No secret, hash, counter,
or lockout state is exposed. Locked-out rows are deliberately still listed:
hiding them would turn this endpoint into a lockout oracle, and the operator
still needs to find their own station.

## Deploy

```bash
supabase functions deploy login-options
```

Environment variables are identical to `staff-login`; see that README.
