const { db, generateToken } = require('./db');

function seedWorkspaceData() {
  // 1. Users (Manan's main email, Teammate email, and Francesco from screenshots)
  const usersToSeed = [
    {
      name: 'Alex Rivera',
      email: 'team@threadly.io',
      role: 'Admin',
      status: 'Active',
      max_capacity: 25,
    },
    {
      name: 'Jordan Lee',
      email: 'jordan@threadly.io',
      role: 'Agent',
      status: 'Active',
      max_capacity: 25,
    },
    {
      name: "Francesco D'Alessio",
      email: 'francesco@keepproductive.com',
      role: 'Supervisor',
      status: 'Active',
      max_capacity: 30,
    },
  ];

  const userMap = {};
  for (const u of usersToSeed) {
    db.prepare(`
      INSERT INTO users (name, email, role, status, max_capacity)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        status = excluded.status
    `).run(u.name, u.email, u.role, u.status, u.max_capacity);
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(u.email);
    userMap[u.email] = row;
  }

  // 2. Shared Inboxes (Team Inbox, Support Live Chat, WhatsApp, Voice)
  const inboxesToSeed = [
    {
      name: 'Demo Inbox',
      email: 'team@threadly.io',
      channel_type: 'email',
      auto_assign_mode: 'round_robin',
    },
    {
      name: 'Support Live Chat',
      email: 'chat@threadly.app',
      channel_type: 'chat',
      auto_assign_mode: 'round_robin',
    },
    {
      name: 'WhatsApp Desk',
      email: '+1-800-555-0199',
      channel_type: 'whatsapp',
      auto_assign_mode: 'round_robin',
    },
    {
      name: 'Voice Helpdesk',
      email: 'voice@threadly.app',
      channel_type: 'voice',
      auto_assign_mode: 'none',
    },
  ];

  const inboxMap = {};
  for (const ib of inboxesToSeed) {
    db.prepare(`
      INSERT INTO shared_inboxes (name, email, channel_type, auto_assign_mode, csat_enabled)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        channel_type = excluded.channel_type,
        auto_assign_mode = excluded.auto_assign_mode
    `).run(ib.name, ib.email, ib.channel_type, ib.auto_assign_mode);
    const row = db.prepare('SELECT * FROM shared_inboxes WHERE email = ?').get(ib.email);
    inboxMap[ib.name] = row;

    for (const u of Object.values(userMap)) {
      db.prepare('INSERT OR IGNORE INTO inbox_members (inbox_id, user_id) VALUES (?, ?)').run(
        row.id,
        u.id
      );
    }
  }
  inboxMap['Team Inbox'] = inboxMap['Demo Inbox'];

  // 3. Shared Tags (Bulk Order, Damaged, Address Change, Refund, Urgent VIP)
  const tagsToSeed = [
    { name: 'Bulk Order', color: '#16A34A', description: 'Wholesale and corporate orders over 100 units' },
    { name: 'Damaged', color: '#DC2626', description: 'Damaged shipment requiring replacement' },
    { name: 'Address Change', color: '#9333EA', description: 'Customer requested shipping address update' },
    { name: 'VIP Account', color: '#D97706', description: 'Enterprise priority account' },
    { name: 'Billing & Invoice', color: '#2563EB', description: 'Invoice, refund, or QuickBooks billing inquiry' },
  ];

  const tagMap = {};
  for (const t of tagsToSeed) {
    db.prepare(`
      INSERT INTO tags (inbox_id, name, color, description)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET color = excluded.color, description = excluded.description
    `).run(inboxMap['Demo Inbox'].id, t.name, t.color, t.description);
    tagMap[t.name] = db.prepare('SELECT * FROM tags WHERE name = ?').get(t.name);
  }

  // 4. Custom Fields
  const customFieldsToSeed = [
    { name: 'Order Type', options: ['Corporate Retreat', 'Retail', 'Subscription', 'Replacement'] },
    { name: 'Region', options: ['North America', 'Europe', 'Asia-Pacific'] },
  ];
  for (const cf of customFieldsToSeed) {
    db.prepare(`
      INSERT INTO custom_fields (name, field_type, options_json, is_required)
      VALUES (?, 'dropdown', ?, 0)
      ON CONFLICT(name) DO UPDATE SET options_json = excluded.options_json
    `).run(cf.name, JSON.stringify(cf.options));
  }

  // 5. SLA Policies (Matching "Address Change SLA applied" & "Resolution due by 2:29 AM tomorrow")
  db.exec('DELETE FROM sla_policies');
  const sla1 = db.prepare(`
    INSERT INTO sla_policies (inbox_id, name, condition_field, condition_value, first_response_minutes, resolution_minutes, business_hours_only, is_active)
    VALUES (?, 'Address Change', 'tag', 'Address Change', 30, 840, 0, 1)
  `).run(inboxMap['Demo Inbox'].id);

  db.prepare(`
    INSERT INTO sla_policies (inbox_id, name, condition_field, condition_value, first_response_minutes, resolution_minutes, business_hours_only, is_active)
    VALUES (?, 'Enterprise Bulk Order', 'tag', 'Bulk Order', 60, 720, 0, 1)
  `).run(inboxMap['Demo Inbox'].id);

  // 6. Automations (Matching Screenshot 000400 & 000429)
  db.exec('DELETE FROM automations');
  db.prepare(`
    INSERT INTO automations (
      inbox_id, name, is_active, condition_field, condition_operator, condition_value,
      action_add_tag, action_assign_user_id, action_set_status, action_set_priority, triggered_count
    ) VALUES (?, 'Subject contains bu...', 1, 'subject', 'contains', 'bulk', 'Bulk Order', ?, 'Open', 'High', 4)
  `).run(inboxMap['Demo Inbox'].id, userMap['team@threadly.io'].id);

  db.prepare(`
    INSERT INTO automations (
      inbox_id, name, is_active, condition_field, condition_operator, condition_value,
      action_add_tag, action_assign_user_id, action_set_status, action_set_priority, triggered_count
    ) VALUES (?, 'Subject contains ch...', 1, 'subject', 'contains', 'change', 'Address Change', ?, 'Open', 'Urgent', 2)
  `).run(inboxMap['Demo Inbox'].id, userMap['jordan@threadly.io'].id);

  // 7. Email Templates
  db.exec('DELETE FROM email_templates');
  db.prepare(`
    INSERT INTO email_templates (inbox_id, name, category, subject, body, created_by)
    VALUES
      (?, 'Bulk Order Pricing & Catalog', 'Sales', 'Re: Bulk Order Inquiry', 'Hi {{customer_name}},\n\nThank you for reaching out regarding your bulk order! For orders of 300+ personalized units, we offer a 20% volume discount and complimentary logo proofing.\n\nOur corporate account specialist has been assigned to your thread and will share the itemized quote shortly.\n\nBest regards,\nAlex Rivera', 'Alex Rivera'),
      (?, 'Damaged Item Replacement Confirmation', 'Support', 'Replacement Order Dispatched', 'Hi {{customer_name}},\n\nWe sincerely apologize that your shipment arrived damaged. We have immediately queued a priority replacement shipment at zero cost to you.\n\nBest regards,\nSupport Team', 'Alex Rivera'),
      (?, 'Address Change Verified', 'Logistics', 'Shipping Address Updated', 'Hi {{customer_name}},\n\nWe have updated the delivery address on your active shipment as requested.\n\nBest regards,\nSupport Team', 'Jordan Lee')
  `).run(inboxMap['Demo Inbox'].id, inboxMap['Demo Inbox'].id, inboxMap['Demo Inbox'].id);

  // 8. Knowledge Base Categories & Articles
  db.exec('DELETE FROM kb_articles');
  db.exec('DELETE FROM kb_categories');
  const catOrders = db.prepare(`INSERT INTO kb_categories (name, description) VALUES ('Orders & Bulk Customizations', 'Pricing tiers, lead times, and artwork guidelines for bulk orders')`).run().lastInsertRowid;
  const catShipping = db.prepare(`INSERT INTO kb_categories (name, description) VALUES ('Shipping, Returns & Damaged Items', 'How to update delivery addresses or claim instant replacements')`).run().lastInsertRowid;

  db.prepare(`
    INSERT INTO kb_articles (category_id, title, slug, content, status, views, helpful_yes)
    VALUES
      (?, 'How to place a Bulk Order (100+ personalized units)', 'bulk-order-guide', 'For orders over 100 units, email team@threadly.io with your quantity, vector logo, and target delivery date. Standard production turnaround is 5 business days.', 'Published', 142, 39),
      (?, 'Reporting a Damaged Shipment for Instant Replacement', 'damaged-shipment-policy', 'If any item arrives damaged, reply to your order confirmation with a photo and our team will dispatch a replacement within 24 hours under our Address Change / Priority SLA.', 'Published', 98, 27),
      (?, 'Modifying Your Delivery Address Before Dispatch', 'address-change-cutoff', 'Address changes can be processed up to 12 hours before courier pickup. Tag your email with Address Change for priority routing.', 'Published', 76, 21)
  `).run(catOrders, catShipping, catShipping);

  // 9. Connectors, Chatbots & Webhooks
  const providers = ['slack', 'jira', 'asana', 'salesforce', 'quickbooks'];
  for (const p of providers) {
    db.prepare(`
      INSERT INTO connectors (provider, is_connected, config_json, updated_at)
      VALUES (?, 1, '{"workspace":"Threadly Enterprise"}', datetime('now'))
      ON CONFLICT(provider) DO UPDATE SET is_connected = 1
    `).run(p);
  }

  db.exec('DELETE FROM chatbots');
  db.prepare(`
    INSERT INTO chatbots (name, inbox_id, welcome_message, fallback_message, trigger_keywords_json, is_active)
    VALUES ('Threadly Order Triage Bot', ?, 'Hello! Welcome to Threadly Support. Are you inquiring about a Bulk Order, Address Change, or Damaged Shipment?', 'Routing your conversation to Alex Rivera and team...', '["bulk","damaged","address","refund"]', 1)
  `).run(inboxMap['Support Live Chat'].id);

  db.exec('DELETE FROM webhooks');
  db.prepare(`
    INSERT INTO webhooks (name, target_url, events_json, secret_token, is_active)
    VALUES ('Slack #support-escalations Webhook', 'https://hooks.slack.com/services/T000/B000/THREADLY', '["conversation.created","sla.breached","conversation.closed"]', 'whsec_threadly_live_9981', 1)
  `).run();

  // 10. Conversations, Messages, Notes, Activities, Shared Drafts, Approvals & External Links
  db.exec('DELETE FROM conversations');

  const tomorrowDue = new Date(Date.now() + 14 * 3600000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 48 * 3600000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 72 * 3600000).toISOString();

  // CONVERSATION 1: Exact match to Screenshot 000429, 000437, 000449, 000539 ("Bulk Order of coffee mugs", ID 2446-0003)
  const conv1Id = db.prepare(`
    INSERT INTO conversations (
      conversation_code, gmail_thread_id, inbox_id, channel, subject,
      customer_name, customer_email, status, assignee_id, priority,
      custom_fields_json, sla_policy_id, sla_policy_name,
      first_response_due_at, resolution_due_at, first_responded_at, first_assigned_at,
      public_link_enabled, public_token, ai_summary, sentiment, csat_rating, created_at, updated_at
    ) VALUES (
      '2446-0003', 'gmail_bulk_coffee_mugs', ?, 'email', 'Bulk Order of coffee mugs',
      'Amanda', 'Amanda@hiverdemo.com', 'Open', ?, 'High',
      '{"Order Type":"Corporate Retreat","Region":"North America"}', ?, 'Enterprise Bulk Order',
      ?, ?, ?, ?,
      1, ?, ?, 'Positive', 'Satisfied', ?, datetime('now')
    )
  `).run(
    inboxMap['Demo Inbox'].id,
    userMap['team@threadly.io'].id,
    sla1.lastInsertRowid,
    tomorrowDue,
    tomorrowDue,
    twoHoursAgo,
    twoHoursAgo,
    generateToken(),
    `- Amanda needs to place an order for 300 personalized coffee mugs for an upcoming office retreat.\n- Assigned to Alex Rivera (team@threadly.io) in Demo Inbox under the Bulk Order tag.\n- Shared draft with Reference ID 2446-0003 is active and synced across the team.`,
    twoHoursAgo
  ).lastInsertRowid;

  db.prepare('INSERT INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)').run(
    conv1Id,
    tagMap['Bulk Order'].id
  );
  db.prepare('INSERT INTO conversation_watchers (conversation_id, user_id) VALUES (?, ?), (?, ?)').run(
    conv1Id,
    userMap['team@threadly.io'].id,
    conv1Id,
    userMap['jordan@threadly.io'].id
  );

  db.prepare(`
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, created_at)
    VALUES
      (?, 'Amanda', 'Amanda@hiverdemo.com', 'team@threadly.io', 'Hey!\nI need to place a bulk order for 300 personalized coffee mugs for an upcoming office retreat. Who do I need to speak to for this?\nThanks!\nAmanda', 0, ?),
      (?, 'Alex Rivera', 'team@threadly.io', 'Amanda@hiverdemo.com', 'Hi Amanda,\n\nYour Bulk Order request (Conversation ID: 2446-0003) has been logged. Our corporate merchandise team is preparing your custom 300-unit quote right now.\n\nBest,\nAlex Rivera', 1, datetime('now'))
  `).run(conv1Id, twoHoursAgo, conv1Id);

  db.prepare(`
    INSERT INTO shared_drafts (conversation_id, to_email, body, is_split_private, updated_by_name, updated_at)
    VALUES (?, 'Amanda@hiverdemo.com', '2446-0003 — Hi Amanda, attached is the 20% volume discount breakdown for 300 personalized ceramic mugs.', 0, 'Jordan Lee', datetime('now'))
  `).run(conv1Id);

  db.prepare(`
    INSERT INTO notes (conversation_id, author_id, author_name, body, mentions_json, is_ai_summary)
    VALUES
      (?, ?, 'Alex Rivera', '@jordan Please verify warehouse stock for 300 matte ceramic mugs before we send the final quote.', '["jordan@threadly.io"]', 0),
      (?, ?, 'Jordan Lee', 'Verified! We have 850 units in stock ready for custom laser printing.', '[]', 0)
  `).run(conv1Id, userMap['team@threadly.io'].id, conv1Id, userMap['jordan@threadly.io'].id);

  db.prepare(`
    INSERT INTO approvals (conversation_id, requested_by_name, approver_id, approver_name, title, description, status)
    VALUES (?, 'Jordan Lee', ?, 'Alex Rivera', 'Approve 20% Corporate Retreat Discount (300 Mugs)', 'Standard tier is 15%, requesting 20% for 300-unit order.', 'Pending')
  `).run(conv1Id, userMap['team@threadly.io'].id);

  db.prepare(`
    INSERT INTO external_links (conversation_id, provider, external_id, title, status)
    VALUES
      (?, 'salesforce', 'SF-OPP-309', 'Amanda Corporate Retreat — 300 Mugs ($3,600)', 'Negotiation'),
      (?, 'jira', 'OPS-412', 'Custom Logo Proofing — Order #2446-0003', 'In Progress')
  `).run(conv1Id, conv1Id);

  db.prepare(`
    INSERT INTO activities (conversation_id, actor_name, activity_type, description, created_at)
    VALUES
      (?, 'System', 'created', 'New conversation received in Demo Inbox.', ?),
      (?, 'Subject contains bu...', 'automation_triggered', 'Subject contains bu... automation triggered: applied Bulk Order tag.', ?),
      (?, 'Subject contains bu...', 'automation_triggered', 'Subject contains bu... automation triggered: Assigned to Manan.', ?),
      (?, 'System', 'sla_applied', 'Enterprise Bulk Order SLA applied.', datetime('now'))
  `).run(conv1Id, twoHoursAgo, conv1Id, twoHoursAgo, conv1Id, twoHoursAgo, conv1Id);

  // CONVERSATION 2: Exact match to Screenshot 000400 ("Damaged" + "Address Change" SLA & activity timeline)
  const conv2Id = db.prepare(`
    INSERT INTO conversations (
      conversation_code, gmail_thread_id, inbox_id, channel, subject,
      customer_name, customer_email, status, assignee_id, priority,
      custom_fields_json, sla_policy_id, sla_policy_name,
      first_response_due_at, resolution_due_at, first_assigned_at,
      public_link_enabled, public_token, sentiment, created_at, updated_at
    ) VALUES (
      '2446-0001', 'gmail_damaged_address_change', ?, 'email', 'Address Change & Damaged box on Order #8841',
      'david.miller', 'david.miller@acmecorp.io', 'Open', ?, 'Urgent',
      '{"Order Type":"Replacement","Region":"North America"}', ?, 'Address Change',
      ?, ?, ?,
      0, ?, 'Frustrated / Urgent', ?, datetime('now')
    )
  `).run(
    inboxMap['Demo Inbox'].id,
    userMap['jordan@threadly.io'].id,
    sla1.lastInsertRowid,
    tomorrowDue,
    tomorrowDue,
    oneDayAgo,
    generateToken(),
    oneDayAgo
  ).lastInsertRowid;

  db.prepare('INSERT INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)').run(
    conv2Id,
    tagMap['Damaged'].id
  );

  db.prepare(`
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, created_at)
    VALUES (?, 'David Miller', 'david.miller@acmecorp.io', 'team@threadly.io', 'Hi team,\nTwo cartons from Order #8841 arrived damaged in transit. Also, please process an address change for the replacement delivery to our new Austin warehouse.\n\nThanks,\nDavid', 0, ?)
  `).run(conv2Id, oneDayAgo);

  // Exact 6 activity items shown in Screenshot 000400.png!
  db.prepare(`
    INSERT INTO activities (conversation_id, actor_name, activity_type, description, created_at)
    VALUES
      (?, 'System', 'created', 'New conversation received in Demo Inbox.', ?),
      (?, 'Subject contains ch...', 'automation_triggered', 'Subject contains ch... automation triggered: applied Address Change tag.', ?),
      (?, 'System', 'sla_applied', 'Address Change SLA applied.', ?),
      (?, 'You', 'assigned', 'You assigned to Jordan Lee.', datetime('now')),
      (?, 'You', 'tag_added', 'You applied Damaged tag.', datetime('now')),
      (?, 'You', 'tag_removed', 'You removed Address Change tag.', datetime('now'))
  `).run(conv2Id, oneDayAgo, conv2Id, oneDayAgo, conv2Id, oneDayAgo, conv2Id, conv2Id, conv2Id);

  // CONVERSATION 3: Unassigned VIP Billing Inquiry in Demo Inbox
  const conv3Id = db.prepare(`
    INSERT INTO conversations (
      conversation_code, gmail_thread_id, inbox_id, channel, subject,
      customer_name, customer_email, status, assignee_id, priority,
      public_link_enabled, public_token, sentiment, created_at, updated_at
    ) VALUES (
      '2446-0002', 'gmail_vip_invoice', ?, 'email', 'QuickBooks Annual Invoice & Tax Receipt Request',
      'Sophia Chen', 'sophia@veloxlabs.com', 'Pending', NULL, 'Medium',
      0, ?, 'Neutral', ?, datetime('now')
    )
  `).run(inboxMap['Demo Inbox'].id, generateToken(), twoDaysAgo).lastInsertRowid;

  db.prepare('INSERT INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?), (?, ?)').run(
    conv3Id,
    tagMap['VIP Account'].id,
    conv3Id,
    tagMap['Billing & Invoice'].id
  );

  db.prepare(`
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, created_at)
    VALUES (?, 'Sophia Chen', 'sophia@veloxlabs.com', 'team@threadly.io', 'Hello Manan,\nCould you please attach our Q4 QuickBooks invoice and updated W-9 form for our finance team?\nBest,\nSophia', 0, ?)
  `).run(conv3Id, twoDaysAgo);

  // CONVERSATION 4: Resolved / Closed Ticket in Demo Inbox
  const conv4Id = db.prepare(`
    INSERT INTO conversations (
      conversation_code, gmail_thread_id, inbox_id, channel, subject,
      customer_name, customer_email, status, assignee_id, priority,
      first_responded_at, first_assigned_at, resolved_at,
      public_link_enabled, public_token, sentiment, csat_rating, csat_comment, created_at, updated_at
    ) VALUES (
      '2446-0004', 'gmail_resolved_custom_swag', ?, 'email', 'Custom Hoodie Sizing Chart Confirmation',
      'Liam Patel', 'liam@northstar.dev', 'Closed', ?, 'Low',
      ?, ?, datetime('now'),
      0, ?, 'Positive', 'Satisfied', 'Fast response from Manan and clear sizing chart!', ?, datetime('now')
    )
  `).run(
    inboxMap['Demo Inbox'].id,
    userMap['team@threadly.io'].id,
    twoDaysAgo,
    threeDaysAgo,
    generateToken(),
    threeDaysAgo
  ).lastInsertRowid;

  db.prepare(`
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply, created_at)
    VALUES
      (?, 'Liam Patel', 'liam@northstar.dev', 'team@threadly.io', 'Hi! Can you share the chest measurements for the L and XL heavyweight hoodies?', 0, ?),
      (?, 'Alex Rivera', 'team@threadly.io', 'liam@northstar.dev', 'Hi Liam, L is 44 inches and XL is 47 inches. I have also attached our full spec sheet!', 1, datetime('now'))
  `).run(conv4Id, threeDaysAgo, conv4Id);

  // CONVERSATION 5: Support Live Chat Inbox
  const conv5Id = db.prepare(`
    INSERT INTO conversations (
      conversation_code, gmail_thread_id, inbox_id, channel, subject,
      customer_name, customer_email, status, assignee_id, priority,
      first_response_due_at, resolution_due_at,
      public_link_enabled, public_token, sentiment, created_at, updated_at
    ) VALUES (
      '2446-0005', 'chat_visitor_901', ?, 'chat', 'Live Website Chat — Express Shipping Cutoff for 150 Tumblers',
      'Elena Rostova', 'elena@lumina.co', 'Open', ?, 'High',
      ?, ?,
      0, ?, 'Positive', datetime('now'), datetime('now')
    )
  `).run(
    inboxMap['Support Live Chat'].id,
    userMap['team@threadly.io'].id,
    tomorrowDue,
    tomorrowDue,
    generateToken()
  ).lastInsertRowid;

  db.prepare('INSERT INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)').run(
    conv5Id,
    tagMap['Bulk Order'].id
  );

  db.prepare(`
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply)
    VALUES
      (?, 'Elena Rostova', 'elena@lumina.co', 'chat@threadly.app', 'Hi! I am on your pricing page right now. If we confirm our order for 150 matte tumblers today at 3 PM, will it ship out via FedEx Overnight?', 0),
      (?, 'Alex Rivera', 'team@threadly.io', 'elena@lumina.co', 'Hi Elena! Yes, any live chat order confirmed before 4 PM EST ships same-day via FedEx Priority Overnight.', 1)
  `).run(conv5Id, conv5Id);

  db.prepare(`
    INSERT INTO activities (conversation_id, actor_name, activity_type, description)
    VALUES
      (?, 'System', 'created', 'New Live Chat conversation received in Support Live Chat.'),
      (?, 'Auto Assignment', 'assigned', 'Auto-assigned (round robin) to Alex Rivera.')
  `).run(conv5Id, conv5Id);

  // CONVERSATION 6: WhatsApp Desk Inbox
  const conv6Id = db.prepare(`
    INSERT INTO conversations (
      conversation_code, gmail_thread_id, inbox_id, channel, subject,
      customer_name, customer_email, status, assignee_id, priority,
      first_response_due_at, resolution_due_at,
      public_link_enabled, public_token, sentiment, created_at, updated_at
    ) VALUES (
      '2446-0006', 'whatsapp_client_302', ?, 'whatsapp', 'WhatsApp (+1-415-890-4412) — Artwork Vector File Upload',
      'Carlos Mendez', 'carlos@solaris.mx', 'Open', ?, 'Medium',
      ?, ?,
      0, ?, 'Positive', datetime('now'), datetime('now')
    )
  `).run(
    inboxMap['WhatsApp Desk'].id,
    userMap['jordan@threadly.io'].id,
    tomorrowDue,
    tomorrowDue,
    generateToken()
  ).lastInsertRowid;

  db.prepare('INSERT INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)').run(
    conv6Id,
    tagMap['VIP Account'].id
  );

  db.prepare(`
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply)
    VALUES
      (?, 'Carlos Mendez (+1-415-890-4412)', 'carlos@solaris.mx', '+1-800-555-0199', 'Hey team, sending over our high-res .EPS logo file via WhatsApp for order #2446-0006. Can you confirm receipt?', 0),
      (?, 'Jordan Lee', 'jordan@threadly.io', 'carlos@solaris.mx', 'Received your vector logo via WhatsApp, Carlos! Forwarding it to our print setup queue now.', 1)
  `).run(conv6Id, conv6Id);

  db.prepare(`
    INSERT INTO activities (conversation_id, actor_name, activity_type, description)
    VALUES
      (?, 'System', 'created', 'New WhatsApp message received in WhatsApp Desk.'),
      (?, 'You', 'assigned', 'Assigned to Jordan Lee.')
  `).run(conv6Id, conv6Id);

  // CONVERSATION 7: Voice Helpdesk Inbox
  const conv7Id = db.prepare(`
    INSERT INTO conversations (
      conversation_code, gmail_thread_id, inbox_id, channel, subject,
      customer_name, customer_email, status, assignee_id, priority,
      first_response_due_at, resolution_due_at,
      public_link_enabled, public_token, sentiment, created_at, updated_at
    ) VALUES (
      '2446-0007', 'voice_call_778', ?, 'voice', 'Inbound Call Log (04m 18s) — Urgent Warehouse Reroute Request',
      'Marcus Vance', 'marcus@apexlogistics.com', 'Open', ?, 'Urgent',
      ?, ?,
      0, ?, 'Frustrated / Urgent', datetime('now'), datetime('now')
    )
  `).run(
    inboxMap['Voice Helpdesk'].id,
    userMap['team@threadly.io'].id,
    tomorrowDue,
    tomorrowDue,
    generateToken()
  ).lastInsertRowid;

  db.prepare('INSERT INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)').run(
    conv7Id,
    tagMap['Address Change'].id
  );

  db.prepare(`
    INSERT INTO messages (conversation_id, sender_name, sender_email, recipient_email, body, is_agent_reply)
    VALUES
      (?, 'Voice Call Transcript (+1-312-555-0148)', 'marcus@apexlogistics.com', 'voice@threadly.app', '[Call Recording: 04m 18s | Connected to Alex Rivera]\nCaller: Marcus Vance (Apex Logistics)\nTranscript Summary: Customer called to reroute 4 pallets on shipment #AX-902 from Chicago Dock B to Dock D before 5 PM tomorrow.', 0),
      (?, 'Alex Rivera', 'team@threadly.io', 'marcus@apexlogistics.com', 'Logged call summary and dispatched dock change confirmation to carrier.', 1)
  `).run(conv7Id, conv7Id);

  db.prepare(`
    INSERT INTO activities (conversation_id, actor_name, activity_type, description)
    VALUES
      (?, 'Voice Integration', 'created', 'Inbound call (04m 18s) recorded in Voice Helpdesk.'),
      (?, 'System', 'sla_applied', 'Address Change SLA applied.')
  `).run(conv7Id, conv7Id);

  // 11. Custom Dashboards (Matching Screenshot 000518.png: "Customer Support")
  db.exec('DELETE FROM custom_dashboards');
  db.prepare(`
    INSERT INTO custom_dashboards (name, created_by, widgets_json, updated_at)
    VALUES (
      'Customer Support',
      'Alex Rivera',
      ?,
      datetime('now')
    )
  `).run(
    JSON.stringify([
      { id: 'w1', inbox_id: inboxMap['Demo Inbox'].id, inbox_name: 'Demo Inbox', metric: 'New conversations' },
      { id: 'w2', inbox_id: inboxMap['Team Inbox'].id, inbox_name: 'Team Inbox', metric: 'Active conversations' },
    ])
  );

  // 12. Custom Reports
  db.exec('DELETE FROM custom_reports');
  db.prepare(`
    INSERT INTO custom_reports (name, metric, inbox_id, date_range, schedule_frequency, recipient_email)
    VALUES ('Weekly SLA & Bulk Orders Report', 'Active conversations', ?, 'Last 7 days', 'Weekly', 'team@threadly.io')
  `).run(inboxMap['Demo Inbox'].id);

  return { ok: true };
}

module.exports = { seedWorkspaceData };

