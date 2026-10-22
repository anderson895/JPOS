# Cutover: single store → multi-store (Phase 1)

The owner follows this checklist **on the day of the switch**. The Tech Lead prepares the code. Every step that writes to production is run by **you** (the owner), because agents can't deploy.

**What changes**
- All shop data moves from root collections (`products`, `orders`, …) to `tenants/main/…`.
- Every account gets `tenantId: "main"`.
- RFID moves to the shop's terminal link `https://jpos-mu.vercel.app/s/<your-slug>`. The public `/login` keeps email/password + Google.

**Why the order matters**
- The old app reads the root collections. The new app reads `tenants/…`.
- The **transition rules** allow both, so the old and new app work side by side during the switch.
- The final rules allow only `tenants/…`, so they go last, once every device runs the new app.

Nothing is deleted. The old collections stay untouched (rollback safety net).

**Run every command in PowerShell from `D:\Downloads\JPOS-p1`.** That folder has the migration tools (`npm install` was done there) and the multi-store rules.

---

## Before the day (prepare once)

1. **Service-account key** (needed by the migration script):
   - Firebase Console → ⚙ Project settings → **Service accounts** → **Generate new private key**.
   - Save it **outside the repo**, e.g. `C:\keys\jpos-sa.json`.
   - **Never** commit it, share it, or paste it anywhere. It is full admin access to the database.
2. **Decide**:
   - the **shop link** (slug), e.g. `kape-ni-juan` → `…/s/kape-ni-juan`
   - the **shop name**
   - **your owner UID**: Firebase Console → Authentication → your admin account → *User UID*
3. **Dry run on production** (read-only; it writes a backup file on your PC):
   ```powershell
   cd D:\Downloads\JPOS-p1
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\jpos-sa.json"
   npm run migrate -- --project jpos-f801b --slug kape-ni-juan --name "Kape ni Juan" --owner <YOUR_UID>
   ```
   - It prints what it would copy and the number of writes. It writes **nothing** to Firestore.
   - It saves `backups/jpos-f801b-<time>.json`. Keep that file private: it contains staff data.
4. **Rehearse on the emulator** with that backup (optional but recommended):
   ```powershell
   # terminal 1
   firebase emulators:start --only firestore --project demo-jpos
   # terminal 2
   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8085"; Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
   node scripts/load-backup-into-emulator.mjs backups\jpos-f801b-<time>.json --project demo-jpos
   npm run migrate -- --project demo-jpos --slug kape-ni-juan --name "Kape ni Juan" --owner <YOUR_UID> --apply
   npm run migrate -- --project demo-jpos --tenant main --verify      # must end with "OK: verified"
   ```

## On the day (shop closed, about 30 minutes)

| # | Step | Command / action | Check |
|---|---|---|---|
| 1 | Close the shop | No sales during the switch. Tell your staff | — |
| 2 | **Copy the data** (production) | `npm run migrate -- --project jpos-f801b --slug kape-ni-juan --name "Kape ni Juan" --owner <YOUR_UID> --apply --yes-production` | It ends with `OK: … writes done` |
| 3 | **Verify** | `npm run migrate -- --project jpos-f801b --tenant main --verify` | `OK: verified` |
| 4 | **Transition rules** (old + new both work) | `firebase deploy --only firestore:rules --config firebase.transition.json` | `Deploy complete!` |
| 5 | **Deploy the new app** | The Tech Lead merges `p1-multistore` into `main`; you run `git push`; wait for Vercel → **Ready** | https://jpos-mu.vercel.app loads |
| 6 | **Copy anything made in between** | Run step 2 again (same command; it only copies what's new or changed), then step 3 | `OK: verified` |
| 7 | **Every device** | Close all JPOS tabs. On each counter device, open `https://jpos-mu.vercel.app/s/kape-ni-juan` and bookmark it (or *Add to Home Screen*) | The terminal opens on the RFID tab |
| 8 | **Final rules** (multi-store only) | `firebase deploy --only firestore:rules` | `Deploy complete!` |
| 9 | **Smoke test** | Owner login → dashboard numbers look right; Reports (today/week); Staff lists everyone; one **cash** sale; one **GCash** sale with a reference; **RFID tap** at `/s/kape-ni-juan`; sign out → it returns to the terminal | Everything works → open the shop |

## If something goes wrong

- **Before step 8:** the old app still works with the transition rules.
  - In Vercel → Deployments, **Instant Rollback** to the previous deployment.
  - Nothing is lost: the old collections were never changed.
- **After step 8:**
  - Deploy the transition rules again (step 4 command), so both layouts work again.
  - Then roll back Vercel if needed.
  - Sales made in the new layout after the switch are in `tenants/main/orders`. Tell the Tech Lead before rolling back, so they can be copied back.
- **Never** deploy the transition rules again once a **second shop** exists. They don't isolate shops; they are only for this one switch.

## After a week of normal use

The old root collections (`products`, `categories`, `orders`, `rfidCards`, `paymentRefs`, `settings`) are no longer used. A cleanup that deletes them will be provided separately. Keep them until then.
