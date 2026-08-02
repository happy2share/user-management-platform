# IAM Platform

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)
![Keycloak](https://img.shields.io/badge/Keycloak-IAM-4D4D4D)
![Status](https://img.shields.io/badge/status-active-blue)

IAM Platform is a custom Next.js administration and user portal for Keycloak.
It uses NextAuth for application sessions, Keycloak for identity storage, and
Keycloak Admin REST APIs for user, role, group, client, realm, and session
management.

## Features

- Custom login and registration flow backed by Keycloak
- Google SSO login through NextAuth
- NextAuth session handling with Keycloak logout support
- Admin dashboard and reusable admin shell
- User search, filtering, refresh, create, edit, enable, disable, and delete
- Realm-role assignment and role detail pages
- Client listing, client detail pages, and client-role APIs
- Group listing, recursive nested group loading, and group membership assignment
- Realm, authentication, settings, and session-management pages
- Non-admin user portal routing
- Role-specific staff portals for owner, service manager, senior technician,
  technician, and helper apprentice
- App-managed email verification with OTP support
- App-managed MFA/TOTP setup and verification
- Password checker endpoint that validates username/password against Keycloak
  before onboarding and MFA steps
- English/ASCII-safe input normalization where required
- Hindi, Telugu, and English UI string dictionaries
- Local Keycloak provisioning scripts for the car-service sample realm

## Tech Stack

| Area            | Technology                                        |
| --------------- | ------------------------------------------------- |
| Framework       | Next.js App Router                                |
| UI              | React                                             |
| Auth            | NextAuth                                          |
| IAM backend     | Keycloak                                          |
| API integration | Keycloak Admin REST API                           |
| Styling         | CSS modules, global CSS, Tailwind/PostCSS tooling |
| Icons           | Lucide React                                      |

## Getting Started

### Step 1: Set Up Keycloak

Before installing or running the app, set up the Keycloak realm and clients:

[Keycloak setup guide](docs/keycloak-setup.md)

If the realm or client secrets are missing then
login, password checking, email verification, MFA, and admin API calls will
fail.

### Step 2: Install Prerequisites

- Node.js 20 or newer
- npm
- A running Keycloak server
- Access to a Keycloak admin account for initial realm/client setup

On Windows PowerShell, prefer `npm.cmd` instead of plain `npm`.

### Step 3: Install Dependencies

```powershell
npm.cmd install
```

### Step 4: Configure Environment

Copy the committed template and fill in local values:

```powershell
Copy-Item .env.example .env.local
```

update these values in .env.local :

| Variable                                | Purpose                                                |
| --------------------------------------- | ------------------------------------------------------ |
| `NEXTAUTH_URL`                          | Local app URL, usually `http://localhost:3000`         |
| `NEXTAUTH_SECRET`                       | Secret used by NextAuth                                |
| `KEYCLOAK_BASE_URL`                     | Base Keycloak URL, for example `http://localhost:8080` |
| `KEYCLOAK_REALM`                        | Target Keycloak realm                                  |
| `KEYCLOAK_ISSUER`                       | Server-side Keycloak issuer URL                        |
| `NEXT_PUBLIC_KEYCLOAK_ISSUER`           | Browser-visible issuer URL                             |
| `KEYCLOAK_CLIENT_ID`                    | Frontend/login client ID                               |
| `KEYCLOAK_CLIENT_SECRET`                | Frontend/login client secret                           |
| `KEYCLOAK_ADMIN_CLIENT_ID`              | Admin service client ID                                |
| `KEYCLOAK_ADMIN_CLIENT_SECRET`          | Admin service client secret                            |
| `KEYCLOAK_PASSWORD_CHECK_CLIENT_ID`     | Password-check client ID                               |
| `KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET` | Password-check client secret                           |
| `GOOGLE_CLIENT_ID`                      | Google OAuth client ID                                 |
| `GOOGLE_CLIENT_SECRET`                  | Google OAuth client secret                             |

For Google SSO, create an OAuth client in Google Cloud and add this authorized
redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

This first Google SSO flow signs users into the NextAuth application session.
It does not automatically grant Keycloak realm roles. Use Keycloak Google
identity brokering or an explicit role-mapping policy before treating Google
users as admins.

Email SMTP Configuration:

| Variable                           | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `APP_MFA_ENCRYPTION_KEY`           | Stable secret used to encrypt stored app-managed MFA data |
| `APP_MFA_ISSUER`                   | Issuer label shown in authenticator apps                  |
| `EMAIL_VERIFICATION_TOKEN_MINUTES` | Email OTP expiry time                                     |
| `APP_SMTP_HOST`                    | SMTP host for email verification                          |
| `APP_SMTP_PORT`                    | SMTP port `587`                                           |
| `APP_SMTP_SECURE`                  | Use `true` for implicit TLS, usually port `465`           |
| `APP_SMTP_USER`                    | SMTP username                                             |
| `APP_SMTP_PASS`                    | SMTP password or app password                             |
| `APP_SMTP_FROM`                    | sender address                                            |

If SMTP is not configured, the local development flow returns the OTP on screen
for testing.

### Step 5: Run Locally

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

## Validation

After setup:

1. Run `npm.cmd run build`.
2. Run `npm.cmd run dev`.
3. Open `http://localhost:3000`.
