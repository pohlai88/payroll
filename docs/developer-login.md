# Developer Login

The Developer Login feature provides a quick way to sign in during development without manually entering credentials each time.

## Features

- **Quick Access**: One-click login from the sign-in page
- **Environment-Based**: Configurable via environment variables
- **Development Only**: Should not be used in production environments

## Setup

### 1. Create a Neon Auth User

First, create a test user in your Neon Auth instance:

1. Go to your [Neon Console](https://console.neon.tech)
2. Navigate to your project → **Auth**
3. Click **Create User** or use the Neon Auth API
4. Set:
   - Email: `dev@example.com` (or your preferred email)
   - Password: Choose a secure password (e.g., `dev123` for local development)
   - Verify the email if required by your setup

### 2. Create App User in Database

Run the setup script to create the corresponding app user with system admin privileges:

```bash
npx tsx scripts/setup-dev-user.ts --email dev@example.com --name "Dev User" --system-admin
```

This script will:
- Create a user record in the `users` table
- Assign the `SYSTEM_ADMIN` role
- Display instructions for the next step

### 3. Configure Environment Variables

Add the developer credentials to your `.env.local` file:

```bash
# Developer login credentials
VITE_DEV_EMAIL=dev@example.com
VITE_DEV_PASSWORD=dev123
```

**Note**: Never commit `.env.local` to version control. These credentials are for local development only.

### 4. Restart Dev Server

If your dev server is running, restart it to pick up the new environment variables:

```bash
npm run dev
```

## Usage

1. Navigate to the sign-in page (`http://localhost:5173`)
2. Click the **"Developer Login"** button
3. You'll be automatically signed in with the configured developer credentials

## Security Considerations

### Development Only

The Developer Login feature is intended for local development only. For production deployments:

- Do not set `VITE_DEV_EMAIL` and `VITE_DEV_PASSWORD` in production
- The button will attempt to use defaults if env vars are not set, but this will fail if no such user exists
- Consider adding conditional rendering to hide the button in production:

```typescript
// In app.tsx
const isDevelopment = import.meta.env.MODE === 'development';

// Then in JSX:
{isDevelopment && (
  <Button variant="outline" onClick={onDevLogin}>
    Developer Login
  </Button>
)}
```

### Credential Management

- Use a strong password even for development accounts
- Don't reuse production passwords
- Consider using different developer accounts per team member
- Rotate developer credentials periodically

## Customization

### Using Different Credentials

You can set up multiple developer users by:

1. Creating additional Neon Auth users
2. Running the setup script for each user
3. Switching the environment variables as needed

### Creating Regular Users (Non-Admin)

To create a developer user with limited permissions:

```bash
# Use invite-user.ts with specific role and company
npx tsx scripts/invite-user.ts --email dev@example.com --name "Dev User" --role PAYROLL_OPS --company-id <company-uuid>
```

## Troubleshooting

### "Sign-in failed" error

- Verify the user exists in Neon Auth
- Check that the email matches exactly (including case)
- Confirm the password is correct
- Ensure the user is verified if email verification is enabled

### "Unauthorized" or "User not found" error

- The user may exist in Neon Auth but not in the app database
- Run the setup script again to create/verify the app user
- Check that the `users` table has a matching record

### Button not visible

- Verify the code changes are in `src/web/app.tsx`
- Clear your browser cache and reload
- Check the browser console for errors

### Environment variables not loading

- Ensure `.env.local` exists and contains the variables
- Restart the dev server after adding/modifying `.env.local`
- Check that variable names start with `VITE_` (Vite requirement)

## Alternative: Skip Developer Login

If you prefer not to use the Developer Login feature, you can simply:

1. Enter your credentials manually each time
2. Use browser password autofill
3. Keep your email/password in a password manager

The standard login flow works exactly the same as before.
