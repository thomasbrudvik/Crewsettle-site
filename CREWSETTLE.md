# CrewSettle handbook

Read this first in any new conversation about CrewSettle. It describes what the app does, how it calculates, how the system is put together, and the decisions that were made on purpose. It is public, so it contains no prices, customer names, pilot plans or secrets.

Owner: Thomas Brudvik (commercial fisherman, Norway). Contact: thomas@crewsettle.com.

## 1. What CrewSettle is

A crew-share settlement app for US commercial fishing boats (first market: Alaska longline and pot boats). The skipper or bookkeeper enters fish tickets and expenses, sets the crew and their shares, and the app produces a settlement that adds up to the cent, a pay slip for each crew member, and year-end numbers for the accountant's 1099-MISC forms.

It does one narrow thing and must do it correctly: a settlement everyone on board can understand and check. It is not payroll, not tax filing, and not a general fishing-operations app.

## 2. Settlement rules (how the app calculates)

All money is calculated in whole cents. The core is the function `settle()` in `app.html`.

1. **Gross catch value** = sum of every fish ticket line, pounds × price per lb, rounded to the cent per line.
2. **Expenses and lost gear** each have a "who pays" setting:
   - *Before split* (default): taken off the gross before anyone gets a share.
   - *Vessel/owner only*: comes out of the vessel's share.
   - *Crew only*: comes out of the crew pool.
   - *Crew, split equally per person*: every crew member on board pays the same amount, taken off his own pay (for example groceries). Cents are spread so the total is exact.
   - *Custom*: split by a chosen crew percentage; the rest is the vessel's.
   - **IFQ lease fees** (Alaska individual fishing quota, for example halibut and sablefish) are entered on each fish ticket: lease holder, area (optional), lease %, species (one or all on the ticket), the fish taxes on that ticket, and who pays (before split by default). Fee = (value of those species − their share of the ticket's fish taxes) × lease %. The fee is rounded once per lease holder, area and percent, as on a settlement sheet. Each lease holder gets an IFQ lease statement. Verified against a real Alaska settlement sheet: every amount matched to the cent.
3. **Settlement basis** = gross − expenses before split.
4. **Crew share** = basis × crew % (for example 48 %). The vessel/owner gets the rest.
5. **Crew pool** = crew share − crew-only expenses.
6. **Shares**: each person has a number of shares (for example 1, 1.5, 0.5). If someone was on board only part of the trip, their effective share is `share × days on board / days at sea`.
7. **Dividing the pool** (a setting the boat chooses):
   - *The shares on board this trip* (default): the pool is divided by the sum of effective shares. Shares not used by someone who left mid-trip go to the rest of the crew.
   - *A fixed number of shares*: the pool is divided by a fixed number (for example 10). Unused shares go to the vessel/owner and are shown as a separate line.
8. **Rounding**: shares are rounded down to the cent, and the leftover cents go one by one to the people with the largest remainders. The shares always add up exactly to the pool.
9. **Personal deductions** (advance, license, gear, travel, other) come off that one person's pay only. Pay = share − personal deductions. Pay can be negative when draws are larger than the share; the slip then says how much he owes the vessel, and the trip can still be closed (with a warning).
   Boats that pay crew in percent (for example 14 %, 9.5 %) set the crew share to the total of the percents and enter each percent as that person's shares.
10. A **reconciliation** checks that everything balances to the cent. The pay slip shows every step of the math and the rule used for unused shares.

## 3. Trips, versions and history

- **Closing a trip** is blocked if: there is no fish ticket value, no crew, a scanned ticket or receipt has not been checked, or a ticket line has no price. If someone's deductions exceed their share, the app warns but allows closing.
- When a trip is closed, a **locked snapshot** is saved: tickets, expenses, gear, crew terms, every calculation, every pay slip, who closed it and when. Later changes to the crew list never change a closed trip.
- **Corrections**: "Create correction" copies a closed trip into a new editable version and asks for a reason. When it is closed, it becomes version 2 (3, 4 …). The original stays, marked *Superseded*. Year-to-date totals count only the newest version.
- Exports are labelled by version. A superseded version is marked SUPERSEDED in the file name, the file content and a copied slip.
- **Crew members** have a permanent internal ID, so renaming someone never creates a duplicate. A crew member who appears in any closed trip or year-end record can only be **archived and restored, never deleted**. Only people with no history can be deleted.

## 4. Year end and taxes (US)

- The year-end report lists each crew member's trips and totals for the accountant. Amounts are reported as fishing boat proceeds, **1099-MISC Box 5**, not 1099-NEC. The app says the accountant must confirm the boat qualifies (crew normally fewer than 10, paid a share of the catch, no other cash pay except up to $100 per trip for extra duties).
- How shared expenses, personal deductions, advances and later price adjustments affect the Box 5 amount must be confirmed by a US fisheries accountant.
- **W-9**: the app only tracks *status* (received or missing). If missing, the pay slip warns *before payment* that backup withholding (24 %) may be required and to check with the accountant. **The app never calculates or performs withholding.**
- The app does not file anything with the IRS.
- The QuickBooks journal export is a **draft** until an accountant has tested it.

## 5. How the system is built

- **Website and app**: static files on GitHub Pages (this repository), domain crewsettle.com.
  - `index.html` – the public website.
  - `app.html` – the whole app, one file (HTML, CSS and JavaScript). A build label at the bottom shows which version a user has (for example `build 2026-10-19.2`).
  - `data-terms.html` – data terms and privacy.
- **Supabase** (EU, Frankfurt): sign-in by one-time email code, the database, and the scan function.
  - Tables: `boats`, `boat_members`, `seasons` (one JSON document per boat with the whole season: current trip, crew, closed-trip archive).
  - Row Level Security is on for every table. A user only sees boats they are a member of (`is_boat_member`). Nothing is open to signed-out visitors. There is no delete access from the app.
  - Setup: `supabase-schema.sql`. Live check: `supabase-check.sql`.
- **Scan function** (`supabase-scan-function.ts`, deployed in Supabase as `scan`): only signed-in users can call it. It sends the photo to the Anthropic API (Claude) and returns the numbers as JSON. The photo is not stored. The Anthropic API key is stored only as the Supabase secret `ANTHROPIC_API_KEY`.
- **Email**: sign-in codes are sent through Google Workspace (SMTP) from thomas@crewsettle.com.
- **Saving**: the app saves automatically about 1.5 s after a change. It shows "Saved" only after the database has confirmed. Offline it shows "Offline – not saved" and warns before sign-out. There is no offline mode yet (decided: wait for pilot feedback).

## 6. Security rules

- The publishable Supabase key in `app.html` is meant to be public. **Security depends entirely on Row Level Security being correct on every table.** Any new table must have RLS enabled and policies written before it is used. Re-run `supabase-check.sql` after every database change.
- **Never** put these in this repository or in a chat: the Anthropic API key, the Supabase `service_role`/secret key, the database password, email app passwords, or recovery codes.
- No Social Security numbers, bank details or fishing locations are stored. W-9 forms stay with the accountant.
- Photos are not stored. Only the numbers the user checks are saved.

- The scan function rejects anyone who is not signed in. Because anyone can create an account, a monthly **spending limit must be set in the Anthropic Console** (to do: confirm it is set), so a bug or misuse cannot cost more than that limit. A per-user daily scan cap can be added when there are more users.
- The git history of this repository (all versions) was checked on 2026-10-19: no secrets have ever been committed.
- The live database was checked with `supabase-check.sql` on 2026-10-20: RLS on for all three tables, the six expected policies, no rights for signed-out visitors (`anon`), and signed-in users limited to boat_members SELECT, boats SELECT (+ UPDATE of name only), seasons INSERT/SELECT/UPDATE.

## 7. Privacy requests (GDPR) – how a crew member is deleted

The app has no delete button for crew with history (on purpose). Requests are handled by hand:

1. The request comes to thomas@crewsettle.com. Check that the person is who they say they are.
2. The vessel owner is the data controller. Tell them about the request; CrewSettle acts on the owner's instruction (see the data processing agreement).
3. The owner may have to keep pay and tax records by law (US tax records are normally kept for several years). If so, explain that to the crew member and keep the records, but nothing more than needed.
4. If the data is to be removed: in Supabase, replace the person's name everywhere in that boat's season document (current crew, closed-trip archive and the pay-slip text inside it) with "Former crew member". The amounts stay, so the boat's settlements still add up. Use an SQL `replace` on that one boat's row only, and check the result in the app.
5. Confirm to the crew member (and the owner) by email, and note the date in a private log.

A full deletion of a boat's account is done the same way on request from the owner, within 30 days, as promised in the data terms.

## 8. Reviews

This code and its access rules were written and checked by an AI (Claude). An **independent external review** of the Supabase access rules and the scan function is planned before the first real pilot data. Start such a review with `supabase-check.sql` run against the live database, not with the schema file.

## 9. Decisions made on purpose (and why)

| Decision | Why |
|---|---|
| Closed trips are locked; corrections make new versions | Pay disputes need proof of exactly what was paid and why. |
| Never delete crew with history | Year-end and 1099 numbers must stay complete. |
| No SSNs, no W-9 scanning | A leak of SSNs would be the worst possible incident. |
| No photo storage | Less sensitive data; the user checks numbers against the paper before closing. |
| Scans must be checked before closing | A small warning gets ignored; a block does not. |
| Box 5, not 1099-NEC | IRS rules for qualifying fishing crew shares. |
| No withholding in the app | Too risky without an accountant-designed workflow. |
| Skipper never answers accountant questions | The app should make the skipper's job easier, not send him back to business school. |
| Narrow product, not a broad fishing app | Win on a correct, checkable settlement, not on feature count. |
| No offline mode yet | Would store pay data on phones; wait until pilots say they need it. |
| Upgrade Supabase to Pro before real customer data | The free plan has no backups. |

## 10. How changes are made

1. A change is made and tested with automated browser tests before it is handed over.
2. Thomas uploads the changed files to this repository on GitHub. Every upload is a new version in the history and can be rolled back.
3. The uploaded file is compared byte for byte with the tested file.
4. The build label in `app.html` is updated with every app change.

## 11. Not tested yet

Photo scanning with many real fish tickets, a real QuickBooks import, two people editing the same boat at the same time, and unstable connections at sea.
