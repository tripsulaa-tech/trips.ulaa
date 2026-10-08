# Branded confirmation email (Supabase Auth)

Supabase sends the signup confirmation itself; it just needs your sender and template.

## 1. Send from Ulaa Trips (Authentication → Emails → SMTP Settings)
Reuse the Resend account/domain already used by `send-booking-email`:

| Field        | Value                                  |
|--------------|----------------------------------------|
| Enable custom SMTP | on                               |
| Sender email | `accounts@ulaatrips.com` (any address on your verified Resend domain) |
| Sender name  | `Ulaa Trips`                           |
| Host         | `smtp.resend.com`                      |
| Port         | `465`                                  |
| Username     | `resend`                               |
| Password     | your Resend API key                    |

Without custom SMTP, Supabase uses its shared sender with a very low hourly limit — not suitable for real users.

## 2. Template (Authentication → Emails → Templates → "Confirm signup")
- Subject: `Confirm your email — Ulaa Trips`
- Message body: paste the full contents of `confirm-signup.html`.

Also set **Reset password** → subject `Reset your password — Ulaa Trips`, body = `reset-password.html`.

## 3. URLs (Authentication → URL Configuration)
- Site URL: `https://www.ulaatrips.com`
- Redirect URLs: `https://www.ulaatrips.com`, plus `http://localhost:5173` for dev.

## 4. Auth settings worth checking (Authentication → Sign In / Providers → Email)
- Confirm email: **on**
- Secure email change: **on** (an account's email decides which enquiry details it can see)
- Minimum password length: **8** (the popup also enforces 8)
