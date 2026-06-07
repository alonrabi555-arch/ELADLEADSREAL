# ELADLEADS Agent Memory

Last updated: 2026-06-07

## Purpose

This file is the shared working memory for every agent working on this project.

Before doing anything in this repository, read this file first. It explains where the project currently stands, which systems are active, what the user wants, and how agents should avoid stepping on each other.

## Coordination Rules For Multiple Agents

- Do not start coding before reading this file.
- Before editing, state which files or system area you are taking ownership of.
- Do not edit files owned by another active agent unless the parent agent explicitly tells you to integrate.
- Keep write scopes narrow.
- Do not revert changes you did not make.
- If you see unexpected changes, assume another agent or the user made them.
- Prefer small, focused commits or clear file lists.
- For n8n changes, update only the intended nodes and preserve unrelated workflow state.
- For CRM changes, usually only edit `workflows elad/v2/12_crm_dashboard.html`.
- For WordPress visitor tracking, usually only edit `workflows elad/v2/elad-crm-visitor-tracking.php` and rebuild the ZIP.
- For bot/n8n behavior, document exact message text before changing live workflow logic.

Suggested ownership split:

- CRM UI agent: `workflows elad/v2/12_crm_dashboard.html`
- n8n automation agent: workflow `micx5EbT1HVhiyna`
- WordPress tracking agent: `workflows elad/v2/elad-crm-visitor-tracking.php`
- QA agent: read-only unless explicitly asked to patch

## Repo / URLs

- Workspace: `c:\Users\97253\Downloads\N8N WORKFLOW`
- GitHub repo: `https://github.com/alonrabi555-arch/ELADLEADSREAL.git`
- Branch: `main`
- Main CRM file: `workflows elad/v2/12_crm_dashboard.html`
- Public CRM URL: `https://alonrabi555-arch.github.io/ELADLEADSREAL/workflows%20elad/v2/12_crm_dashboard.html`
- WordPress visitor plugin file: `workflows elad/v2/elad-crm-visitor-tracking.php`
- Visitor plugin ZIP: `elad-crm-visitor-tracking-root.zip`

Important: the git tree may contain unrelated old untracked/deleted files. Do not stage or commit unrelated files.

## User/Product Direction

- Product: WhatsApp + CRM system for Elad Rabi's barber academy.
- Current strategy: bot handles only early qualification/video gate; Elad/human continues manually from CRM.
- The bot must feel natural, accessible, and comfortable for teenagers.
- Avoid stiff sales language, over-selling, or emotional assumptions.
- Do not call the offer a "קורס" in bot wording unless the user explicitly asks. Prefer "מסלול" or "אקדמיה".
- Avoid Hebrew long dash styling. Use a normal hyphen `-` when needed.
- Do not infer concerns unless the lead explicitly said them.
- For price questions, do not immediately throw price if context is missing. First ask if the lead already cuts hair and whether they have equipment.
- Never say that 2-3 clients return the investment. The user said this is false for his audience.
- The user wants to know message wording before changing sensitive bot behavior.

## n8n

- Workflow ID: `micx5EbT1HVhiyna`
- Base URL: `https://alon09.app.n8n.cloud`
- The user supplied an n8n API JWT in chat previously. Do not save it in files or print it.
- API update pattern:
  - GET `/api/v1/workflows/micx5EbT1HVhiyna`
  - PUT only `{ name, nodes, connections, settings: { executionOrder }, staticData }`
  - Do not send full returned settings. n8n rejects extra fields.

## Active n8n Design

- Main LLM bot is currently disabled:
  - `LLM Brain`
  - `Has Twilio?`
  - `Twilio Send`
  - `Has Slack?`
  - `Slack Send`
  - `LLM DB Update`
- Intake is active:
  - New lead saves to DB.
  - WhatsApp opening template is sent.
  - Manual mode is set with `human_agent: true`.
- Initial Slack new-lead alert is disabled.
- Slack hot lead alert should happen only after the lead says they watched the video.
- Payment alert goes to `#elad-woocommerce-payment`.
- Incoming WhatsApp message alert goes to `#elad-pop-up-messages`.
- Visitor tracking in n8n should stay disabled. WordPress plugin handles visitor tracking.
- n8n now tracks lead queue state on the `leads` table:
  - `last_message_direction`
  - `last_message_at`
  - `last_inbound_at`
  - `last_outbound_at`
- Incoming WhatsApp messages set `last_message_direction = 'in'`.
- Manual CRM WhatsApp sends set `last_message_direction = 'out'`.
- Video-gate prompts/link messages set queue state to `out`, while "video seen / waiting for human" style states intentionally keep the lead waiting for representative.

## Video Gate Flow

The active automatic part:

1. Lead enters age.
2. If age is 12, bot sends exception questions.
3. If age is 13+, bot asks whether they watched the site video.
4. If they say yes, bot says humans will get back to them and Slack hot lead alert is sent.
5. If they say no, bot sends the site link and starts a wait reminder.

Current live messages:

```text
VIDEO_QUESTION:
מעולה.
לפני שאני ממשיך, ראית את הסרטון של אלעד באתר במלואו?
```

```text
VIDEO_LINK:
קישור חזרה לצפייה באתר
https://www.eladrabi.co.il/start/
```

```text
YES_MESSAGE:
מעולה.
כבר יחזרו אלייך
```

```text
MINOR_EXCEPTION:
אני שמח שאתה מתעניין כבר עכשיו
האקדמיה בדרך כלל נפתחת מגיל 13 ומעלה, אבל בגיל 12 יש לפעמים חריגים אם רואים שיש רצינות ותמיכה מהבית.

כדי להבין אם אפשר לבדוק אותך כחריג, תענה לי רגע בכנות על שתי שאלות קצרות:

1. ההורים שלך יודעים שאתה רוצה להיכנס לתחום הספרות, והם תומכים בזה?
2. אתה חושב שתצליח להתמיד בקורס ולתרגל בבית כמו שצריך?
```

Note: this minor exception message still contains "קורס" and should probably become "מסלול" when the user approves.

If a 12-year-old answers only partly to the two exception questions, the bot should not ask them again to answer both together. It should say:

```text
מעולה.
יחזרו אליך בהמשך
```

Under age 12 / too young timeout message:

```text
אני שמח שפנית אלינו והתעניינת באקדמיה.

כרגע האקדמיה נפתחת מגיל 13 ומעלה, ולכן בשלב הזה עדיין מוקדם להתחיל את המסלול.

אני שומר את הפרטים אצלנו, וכשגיל 13 יתקרב נוכל לחזור אליך ולהמשיך משם.

בינתיים אפשר להמשיך לצפות בתכנים של אלעד ולהכיר את התחום בקצב שלך :)
```

## Video Reminder Wait

- Reminder text:

```text
{name}, יצא לך לראות את הסרטון של אלעד באתר?
```

- Reminder is after 2 hours, not 15 minutes.
- If the lead already said yes or wrote meanwhile, reminder should not send.
- If the reminder would send after 23:00 Israel time or before 10:00, defer it to around 10:00 Israel time.
- The reminder is per specific lead.
- Avoid polling every minute. Use wait + recheck.
- There is usually no reliable real-time WhatsApp "typing" indicator via Twilio/Meta/n8n.
- Practical replacement: before sending a delayed follow-up, check whether a new inbound message arrived after the follow-up was scheduled. If yes, skip the follow-up.

## CRM State

File: `workflows elad/v2/12_crm_dashboard.html`

Important URLs:

```js
VISITORS_URL = 'https://www.eladrabi.co.il/wp-json/elad-crm/v1/visitors'
MARK_NOT_RELEVANT_URL = 'https://alon09.app.n8n.cloud/webhook/mark-not-relevant'
```

CRM quick buttons should include:

- `דף סגירה`
- `הודעת חריג`
- `סילבוס`
- `סרטון לקוח`
- `סרטון טעימה`
- `טלפון מתניה`
- `טלפון עידו`
- `קיט ציוד ספרות`
- `הודעות מאושרות`

Buttons removed earlier and should stay removed:

- `צפייה בסרטון באתר`
- `שאלת סרטון באתר`

CRM behavior:

- Full chat view should look close to WhatsApp.
- On desktop: Enter sends message, Shift+Enter inserts a new line.
- On mobile: new-line behavior was buggy before; be careful when changing key handling.
- Incoming images/videos/files in CRM chat should render visibly.
- `השתלט על השיחה` had duplicate-click issues before; `takeoverRequestPending` should prevent multiple requests.
- `לא רלוונטי` button sends lead to a separate table/category.
- If a not relevant lead writes again, n8n should automatically move them back to human agent / active.

CRM categories:

- No need for category `חדש`.
- No need for old categories like `בשיחה`, `בהתנגדות`.
- `מוכן` is the upper table of leads who need a call after pressing the button on the closing page.
- `קטינים` means under 13 only, not under 18.
- A 12-year-old approved as an exception should not stay in `קטינים`.
- `לא ענו` means the last tracked message is outbound from us/bot/human and the lead has not answered it yet.
- `מחכה לנציג` means the last tracked message is inbound from the lead, so the lead is waiting for Elad/a representative.
- There should be tables for leads inactive for 3 days and 7 days after conversation.
- `לא רלוונטי` should be a separate table/category.

## CRM Quick Message Texts

```text
דף סגירה:
קישור לאתר☝️
https://www.eladrabi.co.il/academy/
```

```text
סילבוס:
זה הסילבוס של הקורס:
https://cdn.jsdelivr.net/gh/alonrabi555-arch/ELADLEADSREAL@main/assets/course-syllabus.pdf
```

```text
סרטון לקוח:
סרטון המלצת תלמיד:
https://cdn.jsdelivr.net/gh/alonrabi555-arch/ELADLEADSREAL@main/assets/customer-testimonial.mp4
```

```text
סרטון טעימה:
תהנה(:
אלעד מסביר פה על כל השלבים להתפתחות בעסק.
https://www.eladrabi.co.il/lesson/
```

```text
טלפון מתניה:
ווצאפ מתניה
+972 55-685-7417
```

```text
טלפון עידו:
ווצאפ עידו
+972 53-480-1897
```

```text
קיט ציוד ספרות:
*הקיט לתלמידים:*
מכונת תספורת מדרגת
מכונת פיניש
מספריי גזירה
מספריי דילול
מסרק צר לעבודת מספריים
מסרק C7
שפריצר מים
מברשת פייד לנקות שיער
ספריי לחיטוי המכונות
אפטר שייב לחיטוי הלקוח
נייר צוואר
קליפסים לתפיסת השיער - *ממתכת*
תער עם ידית רב פעמית וסכינים לשימוש
אבקת נפח וחימר לשיער
```

## Approved WhatsApp Templates

These are approved by Meta/Twilio and should appear in CRM under one button/menu `הודעות מאושרות`.

- `HXc11cefa30092135dc4bc43b937f6b4b1` = הודעה נסיון בספרות
- `HX55eb8059e220c18d4bd28ed98f1ffa64` = אחרי סרטון הטעימה
- `HX73bb0f36b5cb15cea2bae84fa2f958e2` = אחרי הסילבוס
- `HX518ef53b40697528ff50cb800f9e95cb` = אחרי ווצאפ עידו
- `HX87e756bef956ec24fe7ef157daac5af9` = אחרי סרטון המלצה תלמיד
- `HX0b5ec1da8f82fb276624c4aa5355b2ca` = אחרי ווצאפ מתניה
- `HXc1ea8b7395447466f9cde85eb1fefea9` = אחרי דף סגירה

## Slack Channels

- Hot/video-watched lead: `#elad-leads-hot`
- Payment / WooCommerce payment: `#elad-woocommerce-payment`
- Incoming WhatsApp lead messages: `#elad-pop-up-messages`
- Followups channel exists: `#elad-leads-fllowups`

Slack app URLs are not webhook URLs. Use webhook/config in n8n, not `app.slack.com/client/...` links.

Slack CRM links should deep-link to the lead chat:

```text
https://alonrabi555-arch.github.io/ELADLEADSREAL/workflows%20elad/v2/12_crm_dashboard.html?phone=972...&chat=1
```

The CRM reads `phone`, `lead`, or `wa` query params and opens the full chat automatically after leads load.

## WordPress Visitor Tracking

- n8n visitor polling should stay off to avoid executions/credits.
- Tracking should be handled by WordPress plugin installed on `eladrabi.co.il`.
- Endpoint:

```text
https://www.eladrabi.co.il/wp-json/elad-crm/v1/visitors
```

- Plugin stores visitor sessions in WordPress and exposes them to CRM.
- Plugin version includes basic geo lookup via `ipwho.is`.
- Old visitor data was not imported; user decided to start fresh.
- If visitors show location as unknown, check plugin version and whether new visits were recorded after the geo update.

## Useful Checks

CRM JS syntax check:

```powershell
node -e "const fs=require('fs'); const html=fs.readFileSync('workflows elad/v2/12_crm_dashboard.html','utf8'); const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]); scripts.forEach((code,i)=>{try{new Function(code)}catch(e){console.error('script',i+1,e.stack); process.exit(1)}}); console.log('OK scripts', scripts.length);"
```

Raw GitHub check:

```powershell
$url='https://raw.githubusercontent.com/alonrabi555-arch/ELADLEADSREAL/main/workflows%20elad/v2/12_crm_dashboard.html?cb=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$html=(Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30).Content
$html.Contains('NOT_RELEVANT')
```

Visitor endpoint check:

```powershell
Invoke-WebRequest -Uri 'https://www.eladrabi.co.il/wp-json/elad-crm/v1/visitors?limit=3' -UseBasicParsing -TimeoutSec 30
```
