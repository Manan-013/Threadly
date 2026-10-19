const { db, logActivity } = require('./db');

function evaluateCondition(fieldVal, operator, targetVal) {
  const source = String(fieldVal || '').toLowerCase();
  const target = String(targetVal || '').toLowerCase().trim();
  if (!target) return false;
  if (operator === 'equals') return source === target;
  if (operator === 'starts_with') return source.startsWith(target);
  if (operator === 'ends_with') return source.endsWith(target);
  return source.includes(target);
}

function applySlaPolicies(conversationId) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conv) return;

  const convTags = db.prepare(`
    SELECT t.name FROM tags t
    JOIN conversation_tags ct ON ct.tag_id = t.id
    WHERE ct.conversation_id = ?
  `).all(conversationId).map(r => r.name.toLowerCase());

  const policies = db.prepare(`
    SELECT * FROM sla_policies
    WHERE is_active = 1 AND (inbox_id IS NULL OR inbox_id = ?)
    ORDER BY id ASC
  `).all(conv.inbox_id || null);

  for (const policy of policies) {
    let matches = false;
    const condVal = (policy.condition_value || '').toLowerCase().trim();
    if (policy.condition_field === 'all' || !condVal) {
      matches = true;
    } else if (policy.condition_field === 'tag') {
      matches = convTags.includes(condVal);
    } else if (policy.condition_field === 'priority') {
      matches = (conv.priority || '').toLowerCase() === condVal;
    } else if (policy.condition_field === 'domain') {
      matches = (conv.customer_email || '').toLowerCase().endsWith(condVal);
    }

    if (matches && conv.sla_policy_id !== policy.id) {
      const now = new Date();
      const frDue = new Date(now.getTime() + policy.first_response_minutes * 60000).toISOString();
      const resDue = new Date(now.getTime() + policy.resolution_minutes * 60000).toISOString();

      db.prepare(`
        UPDATE conversations
        SET sla_policy_id = ?, sla_policy_name = ?, first_response_due_at = ?, resolution_due_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(policy.id, policy.name, frDue, resDue, conversationId);

      logActivity(
        conversationId,
        'System',
        'sla_applied',
        `${policy.name} SLA applied.`,
        { slaPolicyId: policy.id, slaName: policy.name, resolutionDueAt: resDue }
      );
      break;
    }
  }
}

function evaluateAutomations(conversationId, latestBody = '') {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conv) return;

  const rules = db.prepare(`
    SELECT * FROM automations
    WHERE is_active = 1 AND (inbox_id IS NULL OR inbox_id = ?)
    ORDER BY id ASC
  `).all(conv.inbox_id || null);

  for (const rule of rules) {
    let sourceVal = '';
    if (rule.condition_field === 'subject') sourceVal = conv.subject;
    else if (rule.condition_field === 'body') sourceVal = latestBody;
    else if (rule.condition_field === 'sender_email') sourceVal = conv.customer_email;
    else if (rule.condition_field === 'channel') sourceVal = conv.channel;

    if (evaluateCondition(sourceVal, rule.condition_operator, rule.condition_value)) {
      db.prepare('UPDATE automations SET triggered_count = triggered_count + 1 WHERE id = ?').run(rule.id);

      // 1. Apply tag if configured
      if (rule.action_add_tag && rule.action_add_tag.trim()) {
        const tagName = rule.action_add_tag.trim();
        let tag = db.prepare('SELECT * FROM tags WHERE LOWER(name) = LOWER(?)').get(tagName);
        if (!tag) {
          const info = db.prepare('INSERT INTO tags (inbox_id, name, color) VALUES (?, ?, ?)').run(
            conv.inbox_id || null,
            tagName,
            '#16A34A'
          );
          tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(info.lastInsertRowid);
        }
        const exists = db.prepare('SELECT 1 FROM conversation_tags WHERE conversation_id = ? AND tag_id = ?').get(conversationId, tag.id);
        if (!exists) {
          db.prepare('INSERT INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)').run(conversationId, tag.id);
          logActivity(
            conversationId,
            rule.name,
            'automation_triggered',
            `${rule.name} automation triggered: applied ${tag.name} tag.`,
            { ruleId: rule.id, tagName: tag.name }
          );
        }
      }

      // 2. Assign user if configured
      if (rule.action_assign_user_id) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(rule.action_assign_user_id);
        if (user) {
          db.prepare(`
            UPDATE conversations
            SET assignee_id = ?, first_assigned_at = COALESCE(first_assigned_at, datetime('now')), updated_at = datetime('now')
            WHERE id = ?
          `).run(user.id, conversationId);

          logActivity(
            conversationId,
            rule.name,
            'automation_triggered',
            `${rule.name} automation triggered: Assigned to ${user.name.split(' ')[0]}.`,
            { ruleId: rule.id, assigneeName: user.name }
          );
        }
      }

      // 3. Set priority if configured
      if (rule.action_set_priority && rule.action_set_priority.trim()) {
        db.prepare('UPDATE conversations SET priority = ?, updated_at = datetime(' + "'now'" + ') WHERE id = ?').run(
          rule.action_set_priority.trim(),
          conversationId
        );
      }

      // 4. Set status if configured
      if (rule.action_set_status && rule.action_set_status.trim()) {
        db.prepare('UPDATE conversations SET status = ?, updated_at = datetime(' + "'now'" + ') WHERE id = ?').run(
          rule.action_set_status.trim(),
          conversationId
        );
      }
    }
  }

  // Re-evaluate SLA policies after automation tags/priorities are applied
  applySlaPolicies(conversationId);
}

function runAutoAssignment(conversationId) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conv || conv.assignee_id || !conv.inbox_id) return;

  const inbox = db.prepare('SELECT * FROM shared_inboxes WHERE id = ?').get(conv.inbox_id);
  if (!inbox || inbox.auto_assign_mode === 'none') return;

  let activeUsers = db.prepare(`
    SELECT u.* FROM users u
    JOIN inbox_members im ON im.user_id = u.id
    WHERE im.inbox_id = ? AND u.status = 'Active'
    ORDER BY u.id ASC
  `).all(inbox.id);

  if (activeUsers.length === 0) {
    activeUsers = db.prepare(`SELECT * FROM users WHERE status = 'Active' ORDER BY id ASC`).all();
  }
  if (activeUsers.length === 0) return;

  let chosenUser = null;

  if (inbox.auto_assign_mode === 'round_robin') {
    const lastIdx = activeUsers.findIndex(u => u.id === inbox.last_assigned_user_id);
    const nextIdx = (lastIdx + 1) % activeUsers.length;
    chosenUser = activeUsers[nextIdx];
  } else if (inbox.auto_assign_mode === 'workload') {
    let minLoad = Infinity;
    for (const u of activeUsers) {
      const openCount = db.prepare(`
        SELECT COUNT(*) as c FROM conversations WHERE assignee_id = ? AND status != 'Closed'
      `).get(u.id).c;
      if (openCount < u.max_capacity && openCount < minLoad) {
        minLoad = openCount;
        chosenUser = u;
      }
    }
  }

  if (chosenUser) {
    db.prepare(`
      UPDATE conversations
      SET assignee_id = ?, first_assigned_at = COALESCE(first_assigned_at, datetime('now')), updated_at = datetime('now')
      WHERE id = ?
    `).run(chosenUser.id, conversationId);

    db.prepare('UPDATE shared_inboxes SET last_assigned_user_id = ? WHERE id = ?').run(chosenUser.id, inbox.id);

    logActivity(
      conversationId,
      'Auto Assignment',
      'assigned',
      `Auto-assigned (${inbox.auto_assign_mode.replace('_', ' ')}) to ${chosenUser.name}.`,
      { assigneeId: chosenUser.id, assigneeName: chosenUser.name }
    );
  }
}

function analyzeSentiment(text = '') {
  const lower = text.toLowerCase();
  const urgentWords = ['urgent', 'broken', 'damaged', 'refund', 'cancel', 'unacceptable', 'error', 'issue', 'immediately', 'failed'];
  const positiveWords = ['thank', 'great', 'appreciate', 'awesome', 'helpful', 'resolved', 'perfect'];

  let negScore = 0;
  let posScore = 0;
  for (const w of urgentWords) if (lower.includes(w)) negScore++;
  for (const w of positiveWords) if (lower.includes(w)) posScore++;

  if (negScore > posScore) return 'Frustrated / Urgent';
  if (posScore > negScore) return 'Positive';
  return 'Neutral';
}

function isThankYouReply(text = '') {
  const cleaned = text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const shortThanks = [
    'thanks',
    'thank you',
    'thank you so much',
    'got it',
    'got it thanks',
    'sounds good',
    'perfect thank you',
    'ok thanks',
    'appreciated'
  ];
  return cleaned.length <= 35 && shortThanks.some(phrase => cleaned === phrase || cleaned.startsWith(phrase));
}

async function generateAiSummary(conversationId) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conv) return '';

  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(conversationId);
  const notes = db.prepare('SELECT * FROM notes WHERE conversation_id = ? ORDER BY id ASC').all(conversationId);
  const tags = db.prepare(`
    SELECT t.name FROM tags t
    JOIN conversation_tags ct ON ct.tag_id = t.id
    WHERE ct.conversation_id = ?
  `).all(conversationId).map(t => t.name);

  // Check if Gemini API key is configured in workspace_settings
  const apiKeyRow = db.prepare("SELECT value FROM workspace_settings WHERE key = 'gemini_api_key'").get();
  const apiKey = apiKeyRow ? apiKeyRow.value : process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const transcript = messages.map(m => `${m.sender_name} <${m.sender_email}>: ${m.body}`).join('\n\n');
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Summarize this customer support email conversation in 3 concise bullet points starting with "- ". Subject: ${conv.subject}\n\n${transcript}`
              }]
            }]
          })
        }
      );
      const data = await response.json();
      const generated = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (generated) {
        db.prepare('UPDATE conversations SET ai_summary = ? WHERE id = ?').run(generated.trim(), conversationId);
        return generated.trim();
      }
    } catch (_) {
      // Fallback to local deterministic analyzer below
    }
  }

  const bullets = [];
  if (messages.length > 0) {
    const firstMsg = messages[0];
    const firstLine = firstMsg.body.split(/[\r\n.!?]+/).map(s => s.trim()).filter(Boolean)[0] || conv.subject;
    bullets.push(`- ${conv.customer_name} (${conv.customer_email}) reached out regarding "${conv.subject}": ${firstLine}.`);
  } else {
    bullets.push(`- Conversation opened by ${conv.customer_name} (${conv.customer_email}) with subject "${conv.subject}".`);
  }

  const agentReplies = messages.filter(m => m.is_agent_reply);
  if (agentReplies.length > 0) {
    const lastReply = agentReplies[agentReplies.length - 1];
    const snippet = lastReply.body.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean)[0] || 'Replied to customer';
    bullets.push(`- ${lastReply.sender_name} responded on the thread (Conversation ID ${conv.conversation_code}): "${snippet.slice(0, 110)}".`);
  } else {
    bullets.push(`- Status is currently ${conv.status}${tags.length ? ` with tags [${tags.join(', ')}]` : ''} awaiting agent response.`);
  }

  const domain = (conv.customer_email.split('@')[1] || '').toLowerCase();
  if (notes.length > 0) {
    bullets.push(`- Team internal context (${notes.length} note${notes.length > 1 ? 's' : ''}): "${notes[notes.length - 1].body.slice(0, 100)}".`);
  } else if (domain) {
    bullets.push(`- Main takeaway: Sender domain is "${domain}" with current priority set to "${conv.priority}" and status "${conv.status}".`);
  }

  const summary = bullets.join('\n');
  db.prepare('UPDATE conversations SET ai_summary = ? WHERE id = ?').run(summary, conversationId);
  return summary;
}

function generateSmartReply(conversationId, mode = 'professional', customPrompt = '') {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conv) return '';
  const firstName = (conv.customer_name || 'there').split(' ')[0];

  if (customPrompt && customPrompt.trim()) {
    return `Hi ${firstName},\n\nThank you for reaching out regarding "${conv.subject}" (Ref: ${conv.conversation_code}).\n\n${customPrompt.trim()}\n\nPlease let us know if you have any additional questions.\n\nBest regards,\nSupport Team`;
  }

  if (mode === 'concise') {
    return `Hi ${firstName},\n\nWe have received your request regarding "${conv.subject}" (ID: ${conv.conversation_code}) and are processing it now. We will follow up with an update shortly.\n\nBest,\nSupport Team`;
  }

  if (mode === 'empathetic') {
    return `Hi ${firstName},\n\nThank you for contacting us about "${conv.subject}". I completely understand how important this is, and I am personally looking into your request (Reference ID: ${conv.conversation_code}) right away.\n\nWarm regards,\nSupport Team`;
  }

  return `Hi ${firstName},\n\nThank you for getting in touch with us regarding "${conv.subject}" (Conversation ID: ${conv.conversation_code}).\n\nWe have reviewed your message and our team is actively handling your request. Please reply directly to this thread if you need to share any further details.\n\nBest regards,\nSupport Team`;
}

module.exports = {
  applySlaPolicies,
  evaluateAutomations,
  runAutoAssignment,
  analyzeSentiment,
  isThankYouReply,
  generateAiSummary,
  generateSmartReply,
};
