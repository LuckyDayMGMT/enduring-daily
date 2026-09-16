/* Enduring Daily Cloud Functions
 *  sendRefineryEmail   fires when an idea's status changes in The Refinery
 *  weeklyGatewayBackup Sunday 6pm Central: JSON snapshot + Stage 1 PDFs into the Gateway folder in Shared Drives
 *
 * Secrets (firebase functions:secrets:set):
 *  DRIVE_SA_KEY        full JSON key of the gateway-backup service account (Drive + Gmail via domain-wide delegation)
 *  GATEWAY_FOLDER_ID   Drive folder ID of the Gateway folder in Shared Drives
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const PDFDocument = require("pdfkit");

admin.initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 5 });

const DRIVE_SA_KEY = defineSecret("DRIVE_SA_KEY");
const GATEWAY_FOLDER_ID = defineSecret("GATEWAY_FOLDER_ID");

const SENDER = "scooper@enduring.co";
const SENDER_NAME = "Steven Cooper";
const SITE = "https://enduringdaily.co";
const SCREEN_DAYS = 5;
const LOTS = { allrec: "AllRec", school: "School Apparel", kinetico: "Kinetico SA", ebs: "Enduring HoldCo" };
const CO_FILE = { allrec: "AllRec", school: "SAI", kinetico: "KoSA", ebs: "HoldCo" };

/* ---------------- shared ---------------- */
function jwt(scopes, subject) {
  const key = JSON.parse(DRIVE_SA_KEY.value());
  return new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes, subject });
}

async function sendMail({ to, cc, subject, text }) {
  const auth = jwt(["https://www.googleapis.com/auth/gmail.send"], SENDER);
  const gmail = google.gmail({ version: "v1", auth });
  const headers = [
    `From: ${SENDER_NAME} <${SENDER}>`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ].filter(Boolean).join("\r\n");
  const raw = Buffer.from(headers + "\r\n\r\n" + text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

/* ---------------- 1. Refinery emails ---------------- */
const DECISION_COPY = {
  screened: { subj: "Cleared Stage 1", line: "Your idea cleared the Stage 1 Screener and is moving to the Stage 2 Pressure Test. That step takes a few weeks; you will hear from me when it is scored." },
  scored:   { subj: "Stage 2 scored", line: "Your idea has been scored in Stage 2 and placed in the Enduring portfolio queue." },
  queued:   { subj: "Cleared the Gateway", line: "Your idea cleared the Gateway and is queued for build." },
  hold:     { subj: "On hold", line: "Your idea is on hold. One question has to be resolved before it can move." },
  declined: { subj: "Declined", line: "Your idea will not move forward at this time." }
};

exports.sendRefineryEmail = onValueWritten(
  { ref: "/lots/{lot}/{id}/status", instance: "enduring-daily-default-rtdb", secrets: [DRIVE_SA_KEY] },
  async (event) => {
    const before = event.data.before.val(), after = event.data.after.val();
    if (!after || before === after) return;
    const { lot, id } = event.params;
    const snap = await admin.database().ref(`lots/${lot}/${id}`).once("value");
    const it = snap.val();
    if (!it || it.deleted) return;
    const leader = (it.forge && it.forge.byEmail) || it.email || null;
    const co = LOTS[lot] || lot;
    const idea = it.text || "your idea";

    if (after === "forged") {
      const link = `${SITE}/gateway.html#${id}`;
      const f = it.forge || {};
      const forgeText = [
        `Company: ${co}`, `Submitted by: ${f.by || it.author || ""} <${leader || ""}>`, "",
        `Problem: ${f.problem || ""}`, `Who does it today: ${f.who || ""}`, `How often: ${f.freq || ""}`, `Cost today: ${f.effort || ""}`,
        `Systems: ${f.systems || ""}`, `Success looks like: ${f.success || ""}`,
        `Rough number: ${f.dollars ? "$" + Math.round(f.dollars).toLocaleString("en-US") + "/yr" : ""}${f.hours ? " " + f.hours + " hrs/wk" : ""}`,
        f.link ? `Example: ${f.link}` : null, "", `Open in The Gateway: ${link}`
      ].filter(x => x !== null).join("\n");
      await sendMail({ to: SENDER, subject: `Forge: ${idea} (${co})`, text: forgeText });
      if (leader && leader.toLowerCase() !== SENDER) {
        await sendMail({
          to: leader, subject: `Received: ${idea}`,
          text: `Received. Thanks for sending this to the Forge.\n\n"${idea}"\n\nI screen it within ${SCREEN_DAYS} business days and you will get one email with the decision. You can follow its progress on your card in The Refinery: ${SITE}/refinery.html\n\nSteven`
        });
      }
      logger.info("forge emails sent", { lot, id });
      return;
    }

    const d = DECISION_COPY[after];
    if (!d || !leader || leader.toLowerCase() === SENDER) return;
    const note = it.note ? `\n\nNote from Steven: ${it.note}` : "";
    await sendMail({
      to: leader, cc: SENDER, subject: `${d.subj}: ${idea}`,
      text: `"${idea}"\n\n${d.line}${note}\n\nYour card in The Refinery shows where it stands: ${SITE}/refinery.html\n\nSteven`
    });
    logger.info("decision email sent", { lot, id, status: after });
  }
);

/* ---------------- 2. Weekly backup to Shared Drives ---------------- */
async function findOrCreateFolder(drive, parentId, name) {
  const r = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)", supportsAllDrives: true, includeItemsFromAllDrives: true
  });
  if (r.data.files.length) return r.data.files[0].id;
  const c = await drive.files.create({ requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }, fields: "id", supportsAllDrives: true });
  return c.data.id;
}
async function fileExists(drive, parentId, name) {
  const r = await drive.files.list({ q: `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`, fields: "files(id)", supportsAllDrives: true, includeItemsFromAllDrives: true });
  return r.data.files.length > 0;
}
async function upload(drive, parentId, name, mimeType, body) {
  await drive.files.create({ requestBody: { name, parents: [parentId] }, media: { mimeType, body }, fields: "id", supportsAllDrives: true });
}
const safe = s => (s || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "Untitled";
const ymd = ts => new Date(ts).toISOString().slice(0, 10);

function s1Pdf(ideaText, lot, fin) {
  const v = fin.snapshot || {};
  const DEC = { pass2: "Pass to Stage 2", pilot: "Pass, pilot without Stage 2", hold: "Hold, resolve red-line first", decline: "Decline" };
  const RL = ["Is there a real, named business problem, not just an interesting capability?", "Can we estimate a run-rate profit impact, even a rough one?", "Is there a named owner who will actually use or run the result?", "Can it plausibly ride existing infrastructure (Workspace, Claude Team, local LLM)?", "If it touches sensitive data, can that data stay on the local LLM and off unvetted cloud tools?"];
  const TR = { effort: "Estimated build effort over two weeks of internal time", recurring: "Any new recurring cost", sensitive: "Any tool that touches sensitive data", multi: "Intended to run across more than one portfolio company" };
  const BASIS = { cost: "Cost savings, ~100% to profit", revenue: "Revenue at contribution margin", risk: "Risk / loss avoided, at expected value", moat: "Moat only, no dollars" };
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 64, left: 64, right: 64, bottom: 64 } });
  const chunks = [];
  doc.on("data", c => chunks.push(c));
  const done = new Promise(res => doc.on("end", () => res(Buffer.concat(chunks))));
  const navy = "#193661", brass = "#A6832C", gray = "#595959";
  doc.font("Times-Bold").fontSize(18).fillColor(navy).text("THE GATEWAY | Stage 1: The Screener");
  doc.moveDown(0.3).moveTo(64, doc.y).lineTo(548, doc.y).lineWidth(1.5).strokeColor(brass).stroke().moveDown(0.6);
  doc.font("Helvetica").fontSize(11).fillColor("#000");
  const kv = (k, val) => { doc.font("Helvetica-Bold").text(k + ": ", { continued: true }).font("Helvetica").text(val || ""); };
  kv("Project name", v.name || ideaText);
  kv("Date / Author", `${v.date || ymd(fin.at)} / ${v.author || ""}`);
  const cos = Object.entries(v.cos || {}).filter(([, on]) => on).map(([k]) => ({ holdco: "HoldCo", kosa: "KoSA", allrec: "AllRec Awards", school: "School Apparel", multi: "Multiple" }[k])).join(", ");
  kv("Company(ies) affected", cos || LOTS[lot]);
  doc.moveDown(0.5).font("Helvetica-Bold").text("The idea in two sentences").font("Helvetica").text(v.summary || "").moveDown(0.6);
  doc.font("Times-Bold").fontSize(13).fillColor(navy).text("The five red-line questions").fontSize(11).fillColor("#000").font("Helvetica");
  RL.forEach((q, i) => doc.text(`${i + 1}. ${q}  ${((v.rl || {})["q" + (i + 1)] || "").toUpperCase() || "\u2014"}`));
  doc.moveDown(0.6).font("Times-Bold").fontSize(13).fillColor(navy).text("Declare the profit impact").fontSize(11).fillColor("#000").font("Helvetica");
  kv("Estimated annualized run-rate profit impact", v.dollars != null ? "$" + Math.round(v.dollars).toLocaleString("en-US") + " / yr" : "");
  kv("Basis", BASIS[v.basis] || "");
  kv("Durability", ({ recurring: "Recurring", multi: "Multi-year" + (v.years ? " (" + v.years + " yrs)" : ""), onetime: "One-time" })[v.durability] || "");
  kv("Year-1 requisite", ({ topline: "Top-line / margin", infra: "AI infrastructure", workflow: "Workflow mapping" })[v.requisite] || "");
  kv("Confidence", v.confidence ? v.confidence[0].toUpperCase() + v.confidence.slice(1) : "");
  kv("Customer moat claimed", v.moatClaimed === true ? "Yes" : v.moatClaimed === false ? "No" : "");
  doc.moveDown(0.6).font("Times-Bold").fontSize(13).fillColor(navy).text("Stage 2 threshold triggers").fontSize(11).fillColor("#000").font("Helvetica");
  const trig = Object.entries(v.triggers || {}).filter(([, on]) => on).map(([k]) => TR[k]);
  doc.text(trig.length ? trig.join("\n") : "None. Under the threshold.");
  doc.moveDown(0.6).font("Times-Bold").fontSize(13).fillColor(navy).text("Screener decision").fontSize(11).fillColor("#000").font("Helvetica");
  kv("Decision", DEC[fin.decision] || fin.decision);
  kv("Reason / condition", fin.reason || "");
  kv("Finalized", new Date(fin.at).toLocaleString("en-US", { timeZone: "America/Chicago" }) + " by Steven Cooper");
  doc.moveDown(1).fontSize(9).fillColor(gray).text("enduring.co  |  Generated from The Gateway on Enduring Daily");
  doc.end();
  return done;
}

function s2Pdf(ideaText, lot, fin) {
  const v = fin.snapshot || {};
  const CATS = [["value","Business & financial value",20],["strategic","Strategic importance",10],["adoption","User need & adoption potential",15],["workflow","Workflow improvement",10],["reuse","Cross-company reusability",10],["tech","Technical & data readiness",10],["feas","Implementation feasibility",10],["time","Time to measurable value",10],["sponsor","Executive sponsorship & ownership",5]];
  const MOAT = [["data","Proprietary data capture"],["switch","Switching cost created"],["embed","Workflow embedment"],["touch","Proactive touch enablement"],["metric","Retention metric moved"],["lag","Replicability lag"]];
  const TIER = { 1: "Priority 1: Accelerate", 2: "Priority 2: Near-Term", 3: "Priority 3: Viable, Lower Priority", 4: "Priority 4: Validate / Redesign", 5: "Priority 5: Pause / Do Not Pursue" };
  const DEC = { proceed: "Proceed", pilot: "Pilot", validate: "Validate Further", reduce: "Reduce Scope", pipeline: "Future Pipeline", pause: "Pause", reject: "Reject" };
  const REC = { accelerate: "Accelerate", prioritize: "Prioritize", validate: "Validate", viable: "Viable / Lower Priority", pause: "Pause or Redesign", nopursue: "Do Not Pursue" };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : "";
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 64, left: 64, right: 64, bottom: 64 } });
  const chunks = []; doc.on("data", c => chunks.push(c));
  const done = new Promise(res => doc.on("end", () => res(Buffer.concat(chunks))));
  const navy = "#193661", brass = "#A6832C", gray = "#595959";
  const H = t => doc.moveDown(0.6).font("Times-Bold").fontSize(13).fillColor(navy).text(t).fontSize(11).fillColor("#000").font("Helvetica");
  const kv = (k, val) => { doc.font("Helvetica-Bold").text(k + ": ", { continued: true }).font("Helvetica").text(val || ""); };
  const para = (k, val) => { if (!val) return; doc.font("Helvetica-Bold").text(k).font("Helvetica").text(val).moveDown(0.3); };
  const rows = (obj, cols) => Object.keys(obj || {}).sort().forEach(k => { const r = obj[k]; if (cols.some(c => r[c])) doc.text(cols.map(c => r[c] || "").join("  |  ")); });
  doc.font("Times-Bold").fontSize(18).fillColor(navy).text("THE GATEWAY | Stage 2: The Pressure Test");
  doc.moveDown(0.3).moveTo(64, doc.y).lineTo(548, doc.y).lineWidth(1.5).strokeColor(brass).stroke().moveDown(0.6);
  doc.font("Helvetica").fontSize(11).fillColor("#000");
  kv("Project name", v.name || ideaText);
  kv("Date / Author", `${v.date || ymd(fin.at)} / ${v.author || ""}`);
  const cos = Object.entries(v.cos || {}).filter(([, on]) => on).map(([k]) => ({ holdco: "HoldCo", kosa: "KoSA", allrec: "AllRec Awards", school: "School Apparel", multi: "Multiple" }[k])).join(", ");
  kv("Company(ies) affected", cos || LOTS[lot]);
  doc.moveDown(0.3); para("Proposed solution", v.solution); para("Business problem / opportunity", v.problem); kv("Primary users", v.users); para("Current process / technology", v.current); para("Known constraints", v.constraints);
  H("1. Executive recommendation"); para("", v.recSummary); kv("Recommendation", REC[v.rec] || ""); kv("Primary reason", v.recReason);
  H("2. Business value"); para("Direct, measurable value", v.valueDirect); para("Strategic / indirect value", v.valueStrategic); kv("Primary value driver", v.valueDriver); kv("How success will be measured", v.valueMeasure);
  H("3. User, workflow & adoption test"); para("", v.adoptionNotes); kv("Anticipated adoption", cap(v.adoption) + (v.adoptionNote ? ": " + v.adoptionNote : "")); kv("Greatest adoption risk", v.adoptionRisk);
  H("4. Solution & user experience review"); para("", v.uxNotes); kv("Single largest UX / workflow risk", v.uxRisk);
  H("5. Integration, data & technology readiness"); para("", v.techNotes); kv("Integration complexity", ({ low: "Low", moderate: "Moderate", high: "High", veryhigh: "Very High" })[v.integration] || ""); kv("Unresolved technical dependency", v.techDependency);
  H("6. Minimum viable solution & overbuilding test"); para("", v.mvpNotes); para("Minimum Viable Pilot", v.mvp); para("Deferred features", v.deferred); kv("Scope verdict", ({ under: "Underbuilt", appropriate: "Appropriately Scoped", modover: "Moderately Overbuilt", sigover: "Significantly Overbuilt" })[v.scope] || "");
  H("6b. Growth-ceiling test"); para("", v.ceilingNotes); kv("Flag", ({ blocking: "Growth-blocking (hard ceiling)", limiting: "Growth-limiting (soft ceiling)", neutral: "Growth-neutral" })[fin.ceiling] || ""); if (v.ceilingRationale) para("Sequencing rationale (logged)", v.ceilingRationale);
  H("6c. Customer relationship moat test"); MOAT.forEach(([k, n]) => doc.text(`${n}: ${(v.moat || {})[k] != null ? (v.moat || {})[k] : 0} / 3`)); kv("Moat score", `${fin.moat || 0} / 18, ${cap(fin.moatBand)} moat`); para("", v.moatNotes);
  H("7. Risks, blockers & critical assumptions"); rows(v.risks, ["risk","impact","mit"]); kv("Single issue most likely to prevent success", v.topIssue);
  H("8. Validation exercises"); rows(v.validations, ["exercise","question","evidence"]);
  H("9. Success measures"); rows(v.measures, ["measure","target","method","timing"]);
  H("10. Executive priority score"); CATS.forEach(([k, n, w]) => { const sc = (v.scores || {})[k] || 0; doc.text(`${n}  (${w}%)  score ${sc}  weighted ${Math.round(sc / 5 * w)}`); });
  kv("Overall priority score", `${fin.score} / 100`); kv("Priority classification", TIER[fin.tier] || ""); kv("Confidence level", cap(v.confidence)); kv("Primary reason for the score", v.scoreReason); kv("What would increase the score", v.scoreIncrease);
  H("11. Final decision & next step"); kv("Decision", DEC[fin.decision] || fin.decision); kv("Immediate next step", v.nextStep); kv("Executive owner", v.execOwner); kv("Operational owner", v.opOwner); kv("Technology owner", v.techOwner); kv("Recommended review date", v.reviewDate); kv("Note to the leader", fin.reason);
  kv("Finalized", new Date(fin.at).toLocaleString("en-US", { timeZone: "America/Chicago" }) + " by Steven Cooper");
  doc.moveDown(1).fontSize(9).fillColor(gray).text("enduring.co  |  Generated from The Gateway on Enduring Daily");
  doc.end();
  return done;
}

exports.weeklyGatewayBackup = onSchedule(
  { schedule: "0 18 * * 0", timeZone: "America/Chicago", secrets: [DRIVE_SA_KEY, GATEWAY_FOLDER_ID], timeoutSeconds: 300, memory: "512MiB" },
  async () => {
    const auth = jwt(["https://www.googleapis.com/auth/drive"]);
    const drive = google.drive({ version: "v3", auth });
    const root = GATEWAY_FOLDER_ID.value();
    const backups = await findOrCreateFolder(drive, root, "Backups");
    const stage1 = await findOrCreateFolder(drive, root, "Stage 1 Screeners");
    const stage2 = await findOrCreateFolder(drive, root, "Stage 2 Pressure Tests");
    const { Readable } = require("stream");
    const today = ymd(Date.now());

    const lots = {};
    for (const lot of Object.keys(LOTS)) lots[lot] = (await admin.database().ref("lots/" + lot).once("value")).val() || {};
    const gateway = (await admin.database().ref("gateway").once("value")).val() || {};
    const roles = (await admin.database().ref("roles").once("value")).val() || {};
    const access = (await admin.database().ref("access").once("value")).val() || {};
    const projects = (await admin.database().ref("board/projects").once("value")).val() || {};

    const snapName = `${today}_Enduring_Refinery_Snapshot.json`;
    if (!(await fileExists(drive, backups, snapName))) {
      await upload(drive, backups, snapName, "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), lots, gateway, roles, access, projects }, null, 2));
      logger.info("snapshot uploaded", { snapName });
    }

    let pdfs = 0;
    for (const [lot, items] of Object.entries(lots)) {
      for (const [id, it] of Object.entries(items)) {
        const fin = gateway[id] && gateway[id].final && gateway[id].final.s1;
        if (!fin || it.deleted) continue;
        const name = `${ymd(fin.at)}_${CO_FILE[lot] || "Enduring"}_Gateway_S1_${safe((fin.snapshot && fin.snapshot.name) || it.text)}_v1.pdf`;
        if (await fileExists(drive, stage1, name)) continue;
        const buf = await s1Pdf(it.text, lot, fin);
        await upload(drive, stage1, name, "application/pdf", Readable.from(buf));
        pdfs++;
      }
      for (const [id, it] of Object.entries(items)) {
        const fin = gateway[id] && gateway[id].final && gateway[id].final.s2;
        if (!fin || it.deleted) continue;
        const name = `${ymd(fin.at)}_${CO_FILE[lot] || "Enduring"}_Gateway_S2_${safe((fin.snapshot && fin.snapshot.name) || it.text)}_v1.pdf`;
        if (await fileExists(drive, stage2, name)) continue;
        const buf = await s2Pdf(it.text, lot, fin);
        await upload(drive, stage2, name, "application/pdf", Readable.from(buf));
        pdfs++;
      }
    }
    logger.info("weekly backup done", { pdfs });
  }
);
