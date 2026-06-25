# IAM Platform

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)
![Keycloak](https://img.shields.io/badge/Keycloak-IAM-4D4D4D)
![Status](https://img.shields.io/badge/status-active-blue)

IAM Platform is a custom Next.js administration portal for Keycloak. It uses
NextAuth for application sessions and a confidential Keycloak service account
for Admin REST API operations.

## Features

- Custom login and registration flow
- NextAuth session handling
- Keycloak-backed login and logout
- Admin dashboard and navigation shell
- User search, filtering, refresh, create, edit, enable, disable, and delete
- Realm-role assignment
- Group membership assignment
- Recursive nested group loading
- Realm and settings area under `/realm`
- User portal for non-admin users
- App-managed MFA and email verification flows
- English/ASCII-safe input normalization where required

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

### Prerequisites

- Node.js
- npm
- Running Keycloak instance
- Keycloak realm, frontend client, and admin service client configured

### Installation

```powershell
npm.cmd install
```

### Environment Setup

Copy the committed template and fill in local values:

```powershell
Copy-Item .env.example .env.local
```

`.env.local` is intentionally ignored by Git because it can contain secrets.

Required environment variables:

| Variable                       | Purpose                                        |
| ------------------------------ | ---------------------------------------------- |
| `NEXTAUTH_URL`                 | Local app URL, usually `http://localhost:3000` |
| `NEXTAUTH_SECRET`              | Secret used by NextAuth                        |
| `KEYCLOAK_BASE_URL`            | Base Keycloak URL                              |
| `KEYCLOAK_REALM`               | Target Keycloak realm                          |
| `KEYCLOAK_ISSUER`              | Server-side Keycloak issuer URL                |
| `NEXT_PUBLIC_KEYCLOAK_ISSUER`  | Browser-visible issuer URL                     |
| `KEYCLOAK_CLIENT_ID`           | Frontend/login client ID                       |
| `KEYCLOAK_CLIENT_SECRET`       | Frontend/login client secret                   |
| `KEYCLOAK_ADMIN_CLIENT_ID`     | Admin service client ID                        |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | Admin service client secret                    |

Optional SMTP variables can be set for app-managed email verification. If SMTP
is not configured, the local development flow can show the OTP on screen.

### Run Locally

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

## Keycloak Setup Notes

- Enable Direct Access Grants on the `iam-frontend` client for the custom login form.
- Configure `iam-admin-api` as a confidential client with service-account credentials.
- Assign the required `realm-management` roles to the admin service account.
- Give admin users the `realm-admin` realm role.
- Non-admin users are routed to `/user-portal`.

After changing Keycloak role mappings, sign out and sign in again so NextAuth
receives a fresh access token.

## Scripts

| Command             | Description                             |
| ------------------- | --------------------------------------- |
| `npm.cmd run dev`   | Start the local development server      |
| `npm.cmd run lint`  | Run ESLint                              |
| `npm.cmd run build` | Create a production build               |
| `npm.cmd start`     | Start the production server after build |
