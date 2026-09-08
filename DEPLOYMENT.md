# Deployment guide

Getting Alcove CRM live on Vercel + MongoDB Atlas. Both free tiers.

Budget about 30 minutes the first time.

---

## Step 1 — MongoDB Atlas (the database)

1. Go to <https://www.mongodb.com/cloud/atlas/register> and create a free account.

2. **Create a cluster**
   - Choose **M0 Free**
   - Provider: AWS
   - Region: **Mumbai (ap-south-1)** — closest to India, so the app feels faster
   - Name it something like `alcove`

3. **Create a database user**
   - Left menu → *Database Access* → *Add New Database User*
   - Authentication: Password
   - Username: `alcove_app`
   - Password: click *Autogenerate* and **copy it somewhere safe now** — Atlas
     will not show it again
   - Role: *Read and write to any database*

4. **Allow network access**
   - Left menu → *Network Access* → *Add IP Address*
   - Choose **Allow access from anywhere** (`0.0.0.0/0`)
   - This is required because Vercel's serverless functions do not have fixed
     IP addresses. Your database is still protected by the username and
     password.

5. **Get the connection string**
   - *Database* → *Connect* → *Drivers*
   - Copy the string. It looks like:
     ```
     mongodb+srv://alcove_app:<password>@alcove.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - Replace `<password>` with the real password
   - Add the database name before the `?`, like this:
     ```
     mongodb+srv://alcove_app:YourPassword@alcove.xxxxx.mongodb.net/alcove_crm?retryWrites=true&w=majority
     ```

   > If your password contains `@`, `:`, `/` or `#`, it must be URL-encoded.
   > Easiest fix: regenerate a password without those characters.

---

## Step 2 — Generate a session secret

Run this locally and copy the output:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

This signs login sessions. Keep it private; changing it later signs everyone out.

---

## Step 3 — Push the code to GitHub

```bash
git init
git add .
git commit -m "Alcove CRM"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

`.gitignore` already excludes `.env.local`, so your secrets are not committed.

---

## Step 4 — Deploy to Vercel

1. Go to <https://vercel.com> and sign in with GitHub.

2. *Add New* → *Project* → import your repository.

3. Framework preset should auto-detect as **Next.js**. Leave the build settings
   alone.

4. **Before clicking Deploy**, expand *Environment Variables* and add:

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | your Atlas connection string from step 1 |
   | `JWT_SECRET` | the random string from step 2 |
   | `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` |

   You will not know the final URL until after the first deploy — put a
   placeholder in, then update it and redeploy.

5. Click **Deploy** and wait a couple of minutes.

---

## Step 5 — Create the first login

The deployed app has an empty database. Seed it from your own machine, pointing
at the production database:

1. Create `.env.local` locally with the **same** `MONGODB_URI` as Vercel, plus:

   ```
   SEED_ORG_NAME="Your Business Name"
   SEED_ADMIN_NAME="Your Name"
   SEED_ADMIN_EMAIL="you@yourbusiness.com"
   SEED_ADMIN_PASSWORD="ChooseAStrongPassword1"
   ```

2. Run:

   ```bash
   npm run seed
   ```

3. You should see `SEED COMPLETE`. Now open your Vercel URL and sign in.

> Do **not** use `--demo` on the production database — that adds 60 fake leads.

---

## Step 6 — Install it on phones

On each salesperson's phone:

**Android (Chrome)**
1. Open the app URL
2. Tap ⋮ (three dots) → *Add to Home screen* → *Install*

**iPhone (Safari)**
1. Open the app URL — it must be Safari, not Chrome
2. Tap the Share button → *Add to Home Screen*

It now opens like a normal app: full screen, its own icon, no browser bar.

---

## Step 7 — Set it up for your business

Sign in as admin and go to **Settings**:

- Set your business name, phone and GSTIN
- Set the **lead code prefix** (e.g. `RYL` gives `RYL-000123`)
- Set your **response time target** — 30 minutes is a good default
- Keep **"Require a next step after every call"** switched **on**. This is the
  rule that stops leads being forgotten; turning it off removes most of the
  value of the CRM.

Then **Settings → Team** to add your salespeople.

---

## Routine maintenance

**Backups.** Once a week or month, sign in as admin → **Backup** → download the
Excel or JSON file and keep it somewhere safe (Google Drive, an external drive).
Atlas also keeps its own snapshots, but your own copy is the one you control.

**Free tier limits.** Atlas M0 gives 512MB — roughly 100,000+ leads with full
history, so this is unlikely to be a constraint. Vercel's free tier is
comfortable for a team of this size. If you outgrow either, upgrading is a
setting change, not a migration.

---

## Troubleshooting

**"MONGODB_URI is not set"**
The environment variable is missing on Vercel. *Project → Settings →
Environment Variables*, add it, then redeploy — env changes need a new deploy.

**Login page loads but sign-in fails**
- Check `JWT_SECRET` is set on Vercel and is at least 32 characters
- Confirm you ran the seed against the *same* database Vercel uses

**"Could not connect to the database"**
- Atlas → *Network Access* must include `0.0.0.0/0`
- Check the password in the connection string; special characters need encoding

**Account locked after failed logins**
Five wrong passwords locks an account for 15 minutes. Either wait, or another
admin can reset the password from *Settings → Team*.

**The app is not offering to install**
The install prompt requires HTTPS. It works on your `vercel.app` URL, not on
`localhost` over plain HTTP.

---

## Using your own domain

1. Vercel → *Project* → *Settings* → *Domains* → add e.g. `crm.yourbusiness.com`
2. Add the DNS record Vercel shows you at your domain registrar
3. Update `NEXT_PUBLIC_APP_URL` to the new domain and redeploy

HTTPS is issued automatically.
