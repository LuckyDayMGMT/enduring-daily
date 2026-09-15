# Enduring Daily

Live at enduringdaily.co (GitHub Pages) on Firebase project enduring-daily. Everything is client side except two Cloud Functions in `functions/`.

## Pages

| File | What it is | Version stamp in footer |
|---|---|---|
| index.html | Enduring Daily project tracker. @enduring.co only. | Operations Board · v22 |
| refinery.html | The Refinery (was Parking Lot). Leaders see their company; @enduring.co sees all four lots. | The Refinery · v2 |
| gateway.html | The Gateway. Stage 1 in-app; Stage 2 and Value are Phase 2 and 3. @enduring.co only. | The Gateway · v1 |
| lot.html | Redirect to refinery.html so old links and sign-in emails still work. | none |
| bk.html | From the Desk of Steven Cooper. Unchanged. | none |
| database.rules.json | Realtime Database rules. Publish by `firebase deploy --only database` or paste into the console. | n/a |

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
  final/s1: decision reason at dollars basis snapshot
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

## Verified before handoff

Rules file parses as JSON and contains no comment keys. Every inline script and functions/index.js pass `node --check`. All three pages rendered with Playwright against a stubbed Firebase and seed data as owner, editor-less viewer, and a portco leader, desktop and 390px mobile, with zero page errors. Interaction tests passed: keyword pre-flip on and off, Forge modal open and submit (status forged, moat set from checks), leader comment, owner promote (status queued, back link both ways), Gateway draft autosave with company default, red-line verdict, Hold finalize (final record, idea status hold, note copied), reopen button present after finalize, status to Parked with revisit date, viewer sees Stage 1 read-only with no Finalize or status control, leaders see no Gateway links and no Multiple tag.

Not verified: anything that needs the real Firebase, Gmail, or Drive: sign-in, rules enforcement against live writes, email delivery, Drive uploads, function deploy. Test those in order on the live site after deploy.
