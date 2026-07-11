# Keycloak Setup Guide

The project uses the sample `Car_ServiceCenter` realm. You can reuse the same
setup for another business realm by changing the realm, roles, clients, groups,
redirect URLs, and `.env.local` values.

The application requires these Keycloak resources before login, password
checking, email verification, MFA, and admin APIs can work:

| Keycloak item | Default value |
| --- | --- |
| Realm | `Car_ServiceCenter` |
| Frontend client | `iam-frontend` |
| Admin API client | `iam-admin-api` |
| Password-check client | `iam-password-check` |
| Staff group | `Service Center Staff` |
| Admin portal role | `realm-admin` |

## Automated Setup

Copy `.env.example` to `.env.local`, set the bootstrap administrator password,
then run:

```powershell
npm.cmd run provision:car-service
```

The provisioning script creates the realm, clients, roles, composite hierarchy,
staff group, and sample users. It can be safely run again because it reuses
resources that already exist.

To configure only the role hierarchy and service-account permissions for an
existing realm, run:

```powershell
npm.cmd run configure:car-permissions
```

Do not commit `.env.local` or real client secrets.

## Manual Setup

In the Keycloak administration console:

1. Create a realm named `Car_ServiceCenter`.
2. Keep Keycloak self-registration off when registration is handled by the
   Next.js application.
3. Do not globally require Keycloak `VERIFY_EMAIL` or `CONFIGURE_TOTP`; this
   application manages email verification and MFA itself.
4. Create the realm roles listed below.
5. Create the three clients described below.
6. Copy each client secret into `.env.local`.
7. Assign `realm-admin` to at least one administrator.

## Realm Roles

| Role | Purpose |
| --- | --- |
| `realm-admin` | Access the IAM administration portal |
| `app-user` | Default role for self-registered users |
| `owner` | Full service-center ownership access |
| `service-manager` | Manage workshop operations and staff |
| `senior-technician` | Lead diagnostics and review repair work |
| `technician` | Perform and update service tasks |
| `helper-apprentice` | Limited apprentice/helper access |

Create this composite hierarchy:

| Parent role | Composite child roles |
| --- | --- |
| `owner` | `service-manager`, `realm-admin` |
| `service-manager` | `senior-technician` |
| `senior-technician` | `technician` |
| `technician` | `helper-apprentice` |

```text
owner
  service-manager
    senior-technician
      technician
        helper-apprentice
```

## Client: `iam-frontend`

This confidential client is used by the custom login flow and NextAuth.

- Client type: `OpenID Connect`
- Client authentication: `On`
- Standard flow: `On`
- Direct access grants: `On`
- Service accounts: `Off`
- Valid redirect URI: `http://localhost:3000/*`
- Valid post-logout redirect URI: `http://localhost:3000/*`
- Web origin: `http://localhost:3000`

Copy its secret to `KEYCLOAK_CLIENT_SECRET` in `.env.local`.

## Client: `iam-admin-api`

This confidential service client is used by the Next.js API routes to call the
Keycloak Admin REST API.

- Client type: `OpenID Connect`
- Client authentication: `On`
- Standard flow: `Off`
- Direct access grants: `Off`
- Service accounts: `On`

Copy its secret to `KEYCLOAK_ADMIN_CLIENT_SECRET` in `.env.local`.

Under **Service account roles**, assign the required roles from the
`realm-management` client:

- `view-users`
- `query-users`
- `manage-users`
- `view-realm`
- `manage-realm`
- `view-events`
- `view-clients`
- `manage-clients`
- `view-authorization`
- `manage-authorization`
- `realm-admin`

The included provisioning script assigns the complete permission set used by
the current administration screens.

## Client: `iam-password-check`

This confidential client verifies a user's current username and password for
the pre-login, email-verification, and MFA flows.

- Client type: `OpenID Connect`
- Client authentication: `On`
- Standard flow: `Off`
- Direct access grants: `On`
- Service accounts: `Off`

Copy its secret to `KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET` in `.env.local`.
Password verification fails if this client, direct access grants, or its secret
is missing.

## Environment Configuration

Set these values in `client/.env.local`:

```env
KEYCLOAK_BASE_URL=http://localhost:8080
KEYCLOAK_REALM=Car_ServiceCenter
KEYCLOAK_ISSUER=http://localhost:8080/realms/Car_ServiceCenter
NEXT_PUBLIC_KEYCLOAK_ISSUER=http://localhost:8080/realms/Car_ServiceCenter

KEYCLOAK_CLIENT_ID=iam-frontend
KEYCLOAK_CLIENT_SECRET=replace-with-frontend-client-secret

KEYCLOAK_ADMIN_CLIENT_ID=iam-admin-api
KEYCLOAK_ADMIN_CLIENT_SECRET=replace-with-admin-client-secret

KEYCLOAK_PASSWORD_CHECK_CLIENT_ID=iam-password-check
KEYCLOAK_PASSWORD_CHECK_CLIENT_SECRET=replace-with-password-check-client-secret
```

Use the actual host port of your Keycloak installation. The Docker environment
in `iam/keycloak` defaults to host port `8081`, so its URLs would use
`http://localhost:8081` instead.

Also configure `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and a stable
`APP_MFA_ENCRYPTION_KEY` as documented in `.env.example`.

## User Attributes

The application stores onboarding state in Keycloak user attributes:

- `onboardingStatus`
- `emailVerificationStatus`
- `emailVerificationOtpHash`
- `emailVerificationOtpExpiresAt`
- `appMfaConfigured`
- `appMfaTempSecretEncrypted`
- `appMfaTempSecretCreatedAt`
- `appMfaSecretEncrypted`
- `appMfaConfiguredAt`
- `dashboard`
- `locale`

If Keycloak User Profile validation is strict, add these attributes under
**Realm settings > User profile**. The application also attempts to register
the required attributes through the Admin API.

## Email Verification and MFA

Email verification is application-managed:

- A six-digit OTP is generated.
- Its hash and expiry are stored in Keycloak user attributes.
- SMTP sends the OTP when configured.
- Local development can display the OTP when SMTP is not configured.

MFA is also application-managed:

- The application generates a TOTP secret.
- The secret is encrypted with `APP_MFA_ENCRYPTION_KEY`.
- The encrypted value is stored in Keycloak user attributes.
- Login verifies the submitted OTP after password validation.

Keep `APP_MFA_ENCRYPTION_KEY` stable. Changing it prevents existing encrypted
MFA secrets from being decrypted.

## Validation Checklist

1. Confirm `.env.local` contains the correct realm URLs and client secrets.
2. Sign in as a user with `realm-admin`.
3. Open `/users`, `/roles`, `/groups`, `/clients`, and `/sessions`.
4. Register a new user and complete email verification.
5. Configure MFA and sign in again using password plus OTP.
6. Sign out and confirm the Keycloak session ends.
