const fs = require('fs');

const WORKFLOW_ID = 'micx5EbT1HVhiyna';
const BASE_URL = 'https://alon09.app.n8n.cloud';
const API_KEY = process.env.N8N_API_KEY;
const SOURCE_PATH = 'workflows elad/v2/bot_knowledge_source.md';

if (!API_KEY) throw new Error('Missing N8N_API_KEY environment variable');

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    ...options,
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} failed: ${res.status} ${text.slice(0, 500)}`);
  return json;
}

function node(wf, name) {
  const found = wf.nodes.find(n => n.name === name);
  if (!found) throw new Error(`Missing node: ${name}`);
  return found;
}

function minimalPayload(wf) {
  const rawSettings = wf.settings || {};
  const settings = {};
  for (const key of ['executionOrder', 'callerPolicy']) {
    if (Object.prototype.hasOwnProperty.call(rawSettings, key)) settings[key] = rawSettings[key];
  }
  return { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };
}

function replaceKnowledge(code, knowledge) {
  const start = code.indexOf('const KNOWLEDGE = ');
  if (start < 0) throw new Error('Missing const KNOWLEDGE');
  const end = code.indexOf(';\n\n// Supports', start);
  if (end < 0) throw new Error('Missing end of const KNOWLEDGE');
  const replacement = 'const KNOWLEDGE = ' + JSON.stringify(knowledge) + ';';
  return code.slice(0, start) + replacement + code.slice(end + 1);
}

function ensureSystemPolicy(code) {
  const marker = '# חוקי ברזל — לעולם אל תשבור';
  if (!code.includes(marker)) throw new Error('Missing system prompt marker');
  if (code.includes('# שיטת שיחה של אלעד - מקור ידע מסודר')) return code;

  const policy = [
    '',
    '# שיטת שיחה של אלעד - מקור ידע מסודר',
    'כל הידע העובדתי והמסחרי נמצא ב-KNOWLEDGE. השתמש בו כמקור אמת.',
    'אל תתנהג כמו בוט שאלות. אתה מוביל שיחת התאמה קצרה, רגועה ובוגרת.',
    'אם פרופיל הליד אומר "ראה סרטון: כן" או שהשלב ACTIVE/OBJECTION/READY, אל תשאל שוב אם ראה את הסרטון ואל תחזור לפתיחת "השארת פרטים". ענה להודעה הנוכחית.',
    'בכל הודעה: ענה קודם לשאלה הישירה של הליד, ואז אם צריך שאל שאלה אחת בלבד.',
    'לא לשאול שאלות ברצף בלי לתת ערך. לא לסיים כל הודעה בשאלה.',
    'אם הליד אומר "עזוב", "בוא נעזוב", "לא רוצה לבדוק" או משהו דומה - עזוב את הנושא הזה מיד וענה לנושא החדש.',
    'אחרי שהליד ראה את הסרטון, הובל לפי ארבעת שלבי השיחה: חיבור והבנת מצב, עומק בעיה/תשוקה, התנגדות/מחויבות, הצגת האקדמיה כפתרון.',
    'אל תפתח את כל ההתנגדויות יחד. בחר את השאלה הבאה לפי ההקשר.',
    'אם חסר ידע או צריך אישור של אלעד - action: escalate עם internal_note ברור.',
    ''
  ].join('\\n').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

  return code.replace(marker, policy + marker);
}

function ensureAssetUrls(code) {
  code = code.replace(
    /const ASSET_WARMUP_PAGE = '[^']*';/,
    "const ASSET_WARMUP_PAGE = 'https://www.eladrabi.co.il/academy/';"
  );
  code = code.replace(
    /const ASSET_TESTIMONIAL_VIDEO = '[^']*';/,
    "const ASSET_TESTIMONIAL_VIDEO = 'https://cdn.jsdelivr.net/gh/alonrabi555-arch/ELADLEADSREAL@main/assets/customer-testimonial.mp4';"
  );
  if (!code.includes('const ASSET_SYLLABUS_PDF = ')) {
    code = code.replace(
      /const ASSET_TESTIMONIAL_VIDEO = '[^']*';/,
      "$&\nconst ASSET_SYLLABUS_PDF = 'https://cdn.jsdelivr.net/gh/alonrabi555-arch/ELADLEADSREAL@main/assets/course-syllabus.pdf';"
    );
  } else {
    code = code.replace(
      /const ASSET_SYLLABUS_PDF = '[^']*';/,
      "const ASSET_SYLLABUS_PDF = 'https://cdn.jsdelivr.net/gh/alonrabi555-arch/ELADLEADSREAL@main/assets/course-syllabus.pdf';"
    );
  }

  code = code.replace(
    /case 'send_syllabus':\n\s+twilioCall = tBody\(([\s\S]*?)\);\n\s+dbAsset = \{ asset: 'syllabus', sent_at: new Date\(\)\.toISOString\(\) \};\n\s+break;/,
    "case 'send_syllabus':\n      twilioCall = tMedia(d.message || 'שולח לך סילבוס מסודר שתוכל לעבור עליו ולהראות גם להורים.', ASSET_SYLLABUS_PDF);\n      dbAsset = { asset: 'syllabus', sent_at: new Date().toISOString() };\n      break;"
  );

  return code.replace(
    /https:\/\/www\.eladrabi\.co\.il\/(?!academy\/|start\/|checkout\/)/g,
    'https://www.eladrabi.co.il/start/'
  );
}

function patchBrain(code, knowledge) {
  code = replaceKnowledge(code, knowledge);
  code = ensureSystemPolicy(code);
  code = ensureAssetUrls(code);

  const oldVideoYes = `message: 'מעולה. אז עכשיו אחרי שראית — היה הכל ברור? יש לך שאלות?',`;
  if (code.includes(oldVideoYes)) {
    code = code.replace(oldVideoYes, `message: 'מעולה. אז לפני שאני מסביר לך מה הכי רלוונטי, איפה אתה היום בעולם של ספרות גברים — יש לך כבר ניסיון או שאתה מתחיל מאפס?',`);
  }

  try {
    new Function(`return (async function(){\n${code}\n})`);
  } catch (e) {
    throw new Error(`Patched LLM Brain syntax error: ${e.message}`);
  }
  return code;
}

(async () => {
  const knowledge = fs.readFileSync(SOURCE_PATH, 'utf8').replace(/^\uFEFF/, '');
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  fs.writeFileSync('_live_elad_leads_before_knowledge_source_sync.json', JSON.stringify(wf, null, 2));

  const llm = node(wf, 'LLM Brain');
  llm.parameters.jsCode = patchBrain(llm.parameters.jsCode, knowledge);

  fs.writeFileSync('_live_elad_leads_knowledge_source_sync.json', JSON.stringify(wf, null, 2));
  fs.writeFileSync('_live_elad_leads_knowledge_source_sync_payload.json', JSON.stringify(minimalPayload(wf)));

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: 'PUT', body: JSON.stringify(minimalPayload(wf)) });
  fs.writeFileSync('_live_elad_leads_knowledge_source_sync_response.json', JSON.stringify(updated, null, 2));

  const activated = await api(`/workflows/${WORKFLOW_ID}/activate`, { method: 'POST', body: '{}' });
  fs.writeFileSync('_live_elad_leads_knowledge_source_sync_activate_response.json', JSON.stringify(activated, null, 2));

  const verify = await api(`/workflows/${WORKFLOW_ID}`);
  const brain = node(verify, 'LLM Brain').parameters.jsCode;
  console.log(JSON.stringify({
    active: verify.active,
    model: (brain.match(/const MODEL = '([^']+)'/) || [])[1],
    knowledgeChars: knowledge.length,
    hasSourceTitle: brain.includes('מקור ידע לבוט המכירות של אלעד רבי'),
    hasLandingQuestionnaireKnowledge: brain.includes('קהל יעד') && brain.includes('הנעה לרכישה'),
    hasCatalogKnowledge: brain.includes('ידע מקצועי בסיסי') || brain.includes('קטלוג'),
    videoYesAsksExperience: brain.includes('יש לך כבר ניסיון או שאתה מתחיל מאפס'),
    scheduleStillDisabled: node(verify, 'Every Minute').disabled === true,
  }, null, 2));
})();
