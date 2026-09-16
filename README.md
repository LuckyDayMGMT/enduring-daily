# Enduring Daily

Live at enduringdaily.co (GitHub Pages) on Firebase project enduring-daily. Everything is client side except two Cloud Functions in `functions/`.

## Pages

| File | What it is | Version stamp in footer |
|---|---|---|
| index.html | Enduring Daily project tracker. @enduring.co only. | Operations Board · v22 |
| refinery.html | The Refinery (was Parking Lot). Leaders see their company; @enduring.co sees all four lots. | The Refinery · v3 |
| gateway.html | The Gateway. Stage 1 and Stage 2 in-app with live scoring, the ranked queue, and the value tracker. @enduring.co only. | The Gateway · v3 |
| lot.html | Redirect to refinery.html so old links and sign-in emails still work. | none |
| bk.html | From the Desk of Steven Cooper. Unchanged. | none |
| database.rules.json | Realtime Database rules. Publish by `firebase deploy --only database` or paste into the console. | n/a |

## Phase 3 changes (September 16, 2026)

Gateway v3: value tracker. Each project with a finalized Stage 1 gets a Value card in the detail view, seeded from the Screener's declared run rate, basis, and durability, editable by owner and editors: gross annual run rate, basis, contribution margin (revenue) or probability (risk), go-live date, ramp months, new recurring cost, durability with years, confidence, sourcing notes. The projection engine computes net annual value (cost at 100%, revenue at contribution margin, risk at probability, moat at zero, less recurring cost) and spreads it month by month from go-live with a linear ramp, prorating the go-live month, for the current fiscal year and the next two (Jan to Dec); one-time value lands whole in the go-live month; multi-year stops after the stated years. Quarterly actuals appear once the go-live quarter has started; only the owner can enter them; a quarter with a number counts as realized. Variance compares actuals to the projection for the same quarters only.

A fifth summary card shows realized dollars against the $200K target and opens the Value view: the bar (realized in gold, projected FY in light blue, target line), net run rate of live projects, next two fiscal years, breakdowns by pillar and by company, and a per-project table with net run rate, go-live, FY projection, actual, variance, and the two out-years. Company filter applies. Export CSV on this view exports the value table with every quarter of actuals.

Rules v4: `gateway/$id/value` writable by owner and editors, `gateway/$id/actuals/{YYYYQn}` owner only, both readable by @enduring.co only. The placeholder `draft/value` is gone.

Functions: no change. The weekly snapshot already dumps the whole gateway record, so value and actuals are in it.

Phase 3 deploy: publish database.rules.json, upload gateway.html through GitHub, hard refresh: Gateway v3. Nothing else changes.

## Phase 2 changes (September 15, 2026)

Gateway v2: Stage 2 Pressure Test in-app, every section of the template (project information, executive recommendation, business value, adoption, UX, integration, MVP and overbuilding, growth-ceiling test, six-criterion moat scoresheet, risks, validation exercises, success measures, nine-category priority score, final decision and owners). The score, tier, moat total and band, and ceiling flag update live in a sticky box at the top. Draft autosaves for owner and editors; Finalize (owner) requires all nine categories scored and a decision, records score, tier, ceiling, moat and band on the gateway record, sets the leader's status (Proceed and Pilot to Queued; Validate, Reduce Scope, Future Pipeline to Stage 2 scored; Pause to Parked with the review date as revisit; Reject to Declined), copies the note to the card, and triggers the decision email. Stage 2 is gated: not offered until Stage 1 is finalized, marked Not required when Stage 1 passed to pilot (with a Run anyway button), blocked after Hold or Decline.

The queue card now opens the Portfolio Prioritization Queue: Rank, Company, Project, Score, Run-rate $, Tier, Ceiling, Moat, S1/S2, Status. Owner has up and down arrows per row and an Auto-rank button that applies the Standard's rules in order: Growth-blocking first, then cost before revenue before risk before moat-only, then declared dollars, then moat depth, then score. Manual ranks persist at `gateway/$id/final/rank`; unranked projects fall into rule order below ranked ones. CSV export carries the Stage 2 columns and rank.

Refinery v3: Multiple tag removed. Promote reads Companies affected from the Stage 1 record (finalized snapshot, else draft): more than one ticked, or Multiple, and the tracker chip is Multiple.

Rules v3: `gateway/$id/draft/s2` schema, `gateway/$id/final/s2` (owner only), `gateway/$id/final/rank`.

Functions: Node 22 runtime, firebase-functions ^6.4, firebase-admin ^13. Weekly backup now writes a Stage 2 PDF per finalized Pressure Test into Gateway/Stage 2 Pressure Tests. Redeploy required: replace functions/index.js and functions/package.json, run `cd functions && npm install && cd ..` then `firebase deploy --only functions`.

Phase 2 deploy: publish database.rules.json (paste or `firebase deploy --only database`), upload gateway.html and refinery.html plus the two functions files through GitHub, hard refresh (Refinery v3, Gateway v2, tracker still v22), then redeploy functions from the local folder after copying the two new files into it.

## Phase 1 changes (September 15, 2026)

Refinery: renamed; Protect Moat and Tech tags; Multiple tag (@enduring.co only); Enduring HoldCo lot (key `ebs`, @enduring.co only); tech toggle on the add row that keyword-matching pre-flips and the person always controls; the Forge form (six questions, layer, rough number, six moat checks, durability, Drive link) opens after Add when the toggle is on, or later from the Forge button; six-stop status strip (Forged, Screened, Scored, Queued, Building, Live) with Hold, Parked, Declined as end states; owner note shown on the card; comments thread; Forge answers viewable via the gear button; S1 link into the Gateway for @enduring.co; Promote now writes the back link (`ideaId`, `ideaLot` on the project, `projectId` on the idea) and moves the idea to Queued; Gateway Editors panel (owner) writes `roles/`.

Gateway: summary counts (Forge inbox, Cleared Stage 1, Queued or building, Held); company filter and search; Parked-due-for-revisit list; detail view with the Forge submission, comments, status control and note (owner); Stage 1 Screener with autosaving draft (owner and editors), live red-line and threshold verdicts, Finalize (owner only) which locks S1, sets the leader's status, copies the reason to the card, and triggers the decision email; Reopen; CSV export.

Tracker: Refinery and Gateway chips in the masthead; Multiple as a portco value; projects with `ideaId` show S1/S2 badges derived from the Gateway record (linked, not cyclable); legacy projects keep the manual badges.

Rules: `lots/ebs`; new idea fields; leaders can set status only to `forged`; `note`, `revisit`, `projectId`, `noS2` are owner-only; `gateway/$id/draft` writable by owner and editors, `gateway/$id/final` owner-only, both readable by @enduring.co only; `roles/`; `ideaId`, `ideaLot`, `co = multi` on projects.

## Data model

```
lots/{allrec|school|kinetico|ebs}/{id}
  text ts order author email revenue risk cost moat tech multi date
  status: idea|forged|screened|scored|queued|build|live|measuring|hold|parked|declined
  note revisit projectId noS2 promoted deleted deletedAt
  forge: problem who freq effort systems success layer dollars hours checks{data,leave,routine,reach,metric,copy} feel durability years link submittedAt by byEmail
  comments/{cid}: text ts author uid
gateway/{ideaId}
  draft/s1: name date author summary cos{} rl{q1..q5} dollars basis durability years requisite confidence moatClaimed triggers{} decision reason updatedAt updatedBy
  draft/s2: name date author cos{} solution problem users current constraints rec recSummary recReason valueDirect valueStrategic valueDriver valueMeasure adoptionNotes adoption adoptionNote adoptionRisk uxNotes uxRisk techNotes integration techDependency mvpNotes mvp deferred scope ceilingNotes ceiling ceilingRationale moat{data,switch,embed,touch,metric,lag 0-3} moatNotes risks{r1..r5} topIssue validations{v1..v3} measures{m1..m3} scores{nine cats 1-5} confidence scoreReason scoreIncrease decision nextStep execOwner opOwner techOwner reviewDate updatedAt updatedBy
  final/s1: decision reason at dollars basis snapshot
  final/s2: decision score tier ceiling moat moatBand reason at snapshot
  final/rank: number (queue position set by the owner)
  value: runRate basis cmPct probability goLive rampMonths durability years confidence recurringCost notes updatedAt updatedBy
  actuals/{YYYYQn}: number
roles/{emailKey}: editor
access/{emailKey}: allrec|school|kinetico
board/projects/{pid}: ... ideaId ideaLot co(+multi)
```

## Deploy

1. Take a manual backup in Firebase (Realtime Database, Backups tab) before step 2.
2. Publish rules: `firebase deploy --only database`, or paste `database.rules.json` into Realtime Database, Rules, from a plain text editor.
3. Commit and push the html files. Hard refresh: tracker footer reads v22, Refinery footer reads v2, Gateway footer reads v1.
4. Add Brian and Jory as editors in the Refinery's Gateway Editors panel (owner only).
5. Functions, once Blaze is active and the service account exists (see the backup guide, Steps A through G):
   - Workspace Admin console, Security, Access and data control, API controls, Manage domain-wide delegation: add the service account's client ID with scope `https://www.googleapis.com/auth/gmail.send`. This lets it send as scooper@enduring.co.
   - `firebase functions:secrets:set DRIVE_SA_KEY` (paste the JSON key), `firebase functions:secrets:set GATEWAY_FOLDER_ID`
   - `cd functions && npm install && cd ..` then `firebase deploy --only functions`
   - Test: submit a Forge form as a leader in an incognito window. Steven gets the Forge email, the leader gets the receipt. Finalize Stage 1 in the Gateway; the leader gets the decision email.

## Emails (functions/index.js)

Both fire on `lots/{lot}/{id}/status` changes. `forged` sends the Forge contents to scooper@enduring.co with a Gateway link, and a receipt to the submitter promising a screen within 5 business days. `screened`, `scored`, `queued`, `hold`, `declined` send the decision plus the note to the submitter, cc scooper. Nothing else emails.

## Backup (functions/index.js)

`weeklyGatewayBackup` runs Sunday 6:00 PM Central: a dated JSON snapshot of lots, gateway, roles, access, and projects into Gateway/Backups, and a branded PDF of every finalized Stage 1 into Gateway/Stage 1 Screeners, named `YYYY-MM-DD_Company_Gateway_S1_Name_v1.pdf`. Skips files that already exist.

## Verified before handoff (Phase 3)

Rules v4 parse. Gateway script passes `node --check`. Value card seeds run rate 60,000 and basis Revenue from Stage 1; entering go-live Oct 1, 40% margin, 3-month ramp, $2,000 recurring cost saves and projects net 22,000, FY2026 3,667, FY2027 and FY2028 22,000 (hand-checked). A cost project at 12,000 with go-live Jul 1 shows one quarter (Q3) projected 3,000; entering 2,500 actual stores it, shows realized 2,500, variance -500, and the summary card reads $2,500 / $200,000. Value view renders three projects with pillar and company breakdowns and totals. Viewers see every value input disabled. Phase 1 and Phase 2 suites re-run clean.

## Verified before handoff (Phase 2)

Rules v3 parse. All scripts pass `node --check`. Stage 2 rendered and exercised with Playwright against stubbed Firebase and seed data: live score recomputes on a pip click (74 with 8 of 9 scored, 79 with all nine), moat total and band recompute (12 Real to 14 Deep), table rows autosave, Finalize writes final/s2 with score 79, tier 2, ceiling limiting, moat 14 deep, sets the idea to Queued with the note copied; Finalize stays disabled until all nine categories are scored; Stage 2 shows Not required for a pilot decision and Stage 1 first for an unscreened idea. Queue view lists scored and queued projects in rule order (blocking ceiling first), Auto-rank writes ranks, arrows reorder. Refinery shows no Multiple tag and promote sets Multiple when Stage 1 has two companies ticked. Phase 1 interaction suite re-run clean. Not verified: the Node 22 deploy, Stage 2 PDF generation against the live Drive, live rules enforcement.

## Verified before handoff (Phase 1)

Rules file parses as JSON and contains no comment keys. Every inline script and functions/index.js pass `node --check`. All three pages rendered with Playwright against a stubbed Firebase and seed data as owner, editor-less viewer, and a portco leader, desktop and 390px mobile, with zero page errors. Interaction tests passed: keyword pre-flip on and off, Forge modal open and submit (status forged, moat set from checks), leader comment, owner promote (status queued, back link both ways), Gateway draft autosave with company default, red-line verdict, Hold finalize (final record, idea status hold, note copied), reopen button present after finalize, status to Parked with revisit date, viewer sees Stage 1 read-only with no Finalize or status control, leaders see no Gateway links and no Multiple tag.

Not verified: anything that needs the real Firebase, Gmail, or Drive: sign-in, rules enforcement against live writes, email delivery, Drive uploads, function deploy. Test those in order on the live site after deploy.
