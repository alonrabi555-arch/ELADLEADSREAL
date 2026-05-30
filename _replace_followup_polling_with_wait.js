const fs = require('fs');

const WORKFLOW_ID = 'micx5EbT1HVhiyna';
const BASE_URL = 'https://alon09.app.n8n.cloud';
const API_KEY = process.env.N8N_API_KEY;

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

function minimalPayload(wf) {
  const rawSettings = wf.settings || {};
  const settings = {};
  for (const key of ['executionOrder', 'callerPolicy']) {
    if (Object.prototype.hasOwnProperty.call(rawSettings, key)) settings[key] = rawSettings[key];
  }
  return { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings };
}

function findNode(wf, name) {
  return wf.nodes.find(n => n.name === name);
}

function requireNode(wf, name) {
  const n = findNode(wf, name);
  if (!n) throw new Error(`Missing node: ${name}`);
  return n;
}

function upsertNode(wf, name, node) {
  const existing = findNode(wf, name);
  if (existing) {
    Object.assign(existing, node, { id: existing.id, name });
    return existing;
  }
  wf.nodes.push(node);
  return node;
}

function connect(wf, from, to, outputIndex = 0) {
  wf.connections[from] ||= { main: [] };
  wf.connections[from].main ||= [];
  wf.connections[from].main[outputIndex] ||= [];
  const arr = wf.connections[from].main[outputIndex];
  if (!arr.some(c => c.node === to && c.type === 'main' && c.index === 0)) {
    arr.push({ node: to, type: 'main', index: 0 });
  }
}

(async () => {
  const wf = await api(`/workflows/${WORKFLOW_ID}`);
  fs.writeFileSync('_live_elad_leads_before_followup_wait.json', JSON.stringify(wf, null, 2));

  requireNode(wf, 'LLM DB Update');
  requireNode(wf, 'Build Followup');
  requireNode(wf, 'Send or Nurture?');

  const oldSchedule = requireNode(wf, 'Every 30 min');
  oldSchedule.disabled = true;

  upsertNode(wf, 'Needs Followup Wait?', {
    id: 'followup-wait-needed-if',
    name: 'Needs Followup Wait?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [3904, 5792],
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: 'needs-followup-wait',
            leftValue: "={{ Number($('LLM Brain').item.json.next_check_hours || 0) }}",
            rightValue: 0,
            operator: {
              type: 'number',
              operation: 'gt',
            },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  });

  upsertNode(wf, 'Wait Lead Followup', {
    id: 'wait-lead-followup',
    name: 'Wait Lead Followup',
    type: 'n8n-nodes-base.wait',
    typeVersion: 1.1,
    position: [4144, 5792],
    webhookId: 'wait-lead-followup',
    parameters: {
      amount: "={{ Number($('LLM Brain').item.json.next_check_hours || 0) }}",
      unit: 'hours',
    },
  });

  upsertNode(wf, 'Check Followup After Wait', {
    id: 'check-followup-after-wait',
    name: 'Check Followup After Wait',
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [4384, 5792],
    credentials: requireNode(wf, 'Fetch Due Followups').credentials,
    parameters: {
      operation: 'executeQuery',
      query: "SELECT id, phone, name, stage, COALESCE(followup_count, 0) AS followup_count FROM public.leads WHERE phone = '{{ $('LLM Brain').item.json.phone }}' AND next_check_at IS NOT NULL AND next_check_at <= NOW() AND stage NOT IN ('WON', 'DEAD', 'READY', 'NURTURE') LIMIT 1",
      options: {},
    },
  });

  connect(wf, 'LLM DB Update', 'Needs Followup Wait?');
  connect(wf, 'Needs Followup Wait?', 'Wait Lead Followup', 0);
  connect(wf, 'Wait Lead Followup', 'Check Followup After Wait');
  connect(wf, 'Check Followup After Wait', 'Build Followup');

  fs.writeFileSync('_live_elad_leads_followup_wait.json', JSON.stringify(wf, null, 2));
  fs.writeFileSync('_live_elad_leads_followup_wait_payload.json', JSON.stringify(minimalPayload(wf)));

  const updated = await api(`/workflows/${WORKFLOW_ID}`, { method: 'PUT', body: JSON.stringify(minimalPayload(wf)) });
  fs.writeFileSync('_live_elad_leads_followup_wait_response.json', JSON.stringify(updated, null, 2));

  const activated = await api(`/workflows/${WORKFLOW_ID}/activate`, { method: 'POST', body: '{}' });
  fs.writeFileSync('_live_elad_leads_followup_wait_activate_response.json', JSON.stringify(activated, null, 2));

  const verify = await api(`/workflows/${WORKFLOW_ID}`);
  const every30 = requireNode(verify, 'Every 30 min');
  const conns = verify.connections || {};
  console.log(JSON.stringify({
    active: verify.active,
    every30Disabled: every30.disabled === true,
    hasNeedsFollowupWait: !!findNode(verify, 'Needs Followup Wait?'),
    hasWaitLeadFollowup: !!findNode(verify, 'Wait Lead Followup'),
    hasCheckFollowupAfterWait: !!findNode(verify, 'Check Followup After Wait'),
    llmDbUpdateTargets: (conns['LLM DB Update']?.main?.[0] || []).map(c => c.node),
    waitTargetsBuildFollowup: (conns['Check Followup After Wait']?.main?.[0] || []).some(c => c.node === 'Build Followup'),
  }, null, 2));
})();
