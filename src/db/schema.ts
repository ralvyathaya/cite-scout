import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

export const verifications = sqliteTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    brandName: text('brand_name').notNull(),
    canonicalDomain: text('canonical_domain').notNull(),
    contextVersion: integer('context_version').notNull().default(1),
    v2EnabledAt: timestamp('v2_enabled_at'),
    creationKey: text('creation_key'),
    creationHash: text('creation_hash'),
    mutationKey: text('mutation_key'),
    trialScanReservedAt: timestamp('trial_scan_reserved_at'),
    trialScanCompletedAt: timestamp('trial_scan_completed_at'),
    manualScanLastUsedOn: text('manual_scan_last_used_on'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [uniqueIndex('projects_user_id_unique').on(table.userId)],
);

export const competitors = sqliteTable(
  'competitors',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    canonicalDomain: text('canonical_domain'),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('competitors_project_name_unique').on(table.projectId, table.normalizedName),
    index('competitors_project_idx').on(table.projectId),
  ],
);

export const prompts = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    normalizedText: text('normalized_text').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    archivedAt: timestamp('archived_at'),
    replacesQuestionId: text('replaces_question_id'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('prompts_project_text_unique').on(table.projectId, table.normalizedText),
    index('prompts_project_enabled_idx').on(table.projectId, table.enabled),
  ],
);

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    lemonSqueezySubscriptionId: text('lemon_squeezy_subscription_id').notNull().unique(),
    lemonSqueezyCustomerId: text('lemon_squeezy_customer_id').notNull(),
    lemonSqueezyOrderId: text('lemon_squeezy_order_id'),
    lemonSqueezyStoreId: text('lemon_squeezy_store_id').notNull(),
    lemonSqueezyProductId: text('lemon_squeezy_product_id').notNull(),
    lemonSqueezyVariantId: text('lemon_squeezy_variant_id').notNull(),
    status: text('status', {
      enum: ['on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired'],
    }).notNull(),
    cancelled: integer('cancelled', { mode: 'boolean' }).notNull().default(false),
    renewsAt: timestamp('renews_at'),
    endsAt: timestamp('ends_at'),
    trialEndsAt: timestamp('trial_ends_at'),
    paymentProcessor: text('payment_processor'),
    cardBrand: text('card_brand'),
    cardLastFour: text('card_last_four'),
    testMode: integer('test_mode', { mode: 'boolean' }).notNull(),
    providerUpdatedAt: timestamp('provider_updated_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('subscriptions_user_unique').on(table.userId),
    index('subscriptions_customer_idx').on(table.lemonSqueezyCustomerId),
    index('subscriptions_status_ends_idx').on(table.status, table.endsAt),
  ],
);

export const billingWebhookReceipts = sqliteTable('billing_webhook_receipts', {
  fingerprint: text('fingerprint').primaryKey(),
  provider: text('provider').notNull().default('lemonsqueezy'),
  eventName: text('event_name').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  receivedAt: timestamp('received_at').notNull(),
  processedAt: timestamp('processed_at'),
});

export const scanRuns = sqliteTable(
  'scan_runs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    triggerType: text('trigger_type', { enum: ['trial', 'manual', 'scheduled'] }).notNull(),
    provider: text('provider').notNull(),
    status: text('status', {
      enum: [
        'pending',
        'running',
        'completed',
        'partial',
        'failed',
        'deferred',
        'already_observed',
        'cancelled',
      ],
    }).notNull(),
    observationDate: text('observation_date').notNull(),
    intentKey: text('intent_key').unique(),
    phase: text('phase', { enum: ['baseline', 'followup', 'paid'] }),
    contextVersion: integer('context_version'),
    dueAt: timestamp('due_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    attemptedCount: integer('attempted_count').notNull().default(0),
    successfulCount: integer('successful_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('scan_runs_project_date_idx').on(table.projectId, table.observationDate)],
);

export const scanResults = sqliteTable(
  'scan_results',
  {
    id: text('id').primaryKey(),
    scanRunId: text('scan_run_id')
      .notNull()
      .references(() => scanRuns.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerModel: text('provider_model').notNull(),
    providerPreset: text('provider_preset'),
    observationDate: text('observation_date').notNull(),
    rawResponseText: text('raw_response_text'),
    evidenceVersion: text('evidence_version').notNull().default('legacy-normalized'),
    requestContextJson: text('request_context_json'),
    captureJson: text('evidence_json'),
    receivedAt: timestamp('received_at'),
    reportedCost: text('reported_cost'),
    citationDataJson: text('citation_data_json'),
    brandMentioned: integer('brand_mentioned', { mode: 'boolean' }).notNull(),
    brandPosition: integer('brand_position'),
    competitorMentionsJson: text('competitor_mentions_json').notNull().default('[]'),
    matchedTermsJson: text('matched_terms_json').notNull().default('[]'),
    contextClassification: text('context_classification', {
      enum: ['recommended', 'mentioned', 'negative', 'absent', 'unknown'],
    }).notNull(),
    providerRequestId: text('provider_request_id'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    errorCode: text('error_code'),
    errorMessageSafe: text('error_message_safe'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('scan_results_daily_unique').on(
      table.projectId,
      table.promptId,
      table.provider,
      table.observationDate,
    ),
    uniqueIndex('scan_results_run_prompt_unique').on(table.scanRunId, table.promptId),
    index('scan_results_project_history_idx').on(table.projectId, table.observationDate),
    index('scan_results_prompt_history_idx').on(table.promptId, table.observationDate),
  ],
);

export const providerCallReservations = sqliteTable(
  'provider_call_reservations',
  {
    id: text('id').primaryKey(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    promptId: text('prompt_id').references(() => prompts.id, { onDelete: 'set null' }),
    scanRunId: text('scan_run_id').references(() => scanRuns.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    usageDate: text('usage_date').notNull(),
    status: text('status', { enum: ['reserved', 'succeeded', 'failed', 'deferred'] }).notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    providerRequestId: text('provider_request_id'),
    reservedAt: timestamp('reserved_at').notNull(),
    itemId: text('item_id'),
    requestContextJson: text('request_context_json'),
    leaseToken: text('lease_token'),
    leaseUntil: timestamp('lease_until'),
    failureCode: text('failure_code'),
    providerStatus: text('provider_status'),
    providerResponseJson: text('provider_response_json'),
    reportedCost: text('reported_cost'),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('reservations_provider_date_idx').on(table.usageDate, table.provider),
    index('reservations_user_date_idx').on(table.userId, table.usageDate),
    index('reservations_project_date_idx').on(table.projectId, table.usageDate),
    index('reservations_status_time_idx').on(table.status, table.reservedAt),
  ],
);

export const pilotEnrollments = sqliteTable('pilot_enrollments', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  qualifiedAt: timestamp('qualified_at').notNull(),
  manualCheckAt: timestamp('manual_check_at').notNull(),
  role: text('role', { enum: ['founder', 'first_marketer'] }).notNull(),
  authorityConfirmed: integer('authority_confirmed', { mode: 'boolean' }).notNull(),
  exampleVerified: integer('example_verified', { mode: 'boolean' }).notNull(),
  policyVersion: text('policy_version').notNull().default('pilot-v2-1'),
  frozenQuestionIdsJson: text('frozen_question_ids_json'),
  frozenContextJson: text('frozen_context_json'),
  trialStartedAt: timestamp('trial_started_at'),
  expiresAt: timestamp('expires_at'),
  baselineClosedAt: timestamp('baseline_closed_at'),
  followupDueAt: timestamp('followup_due_at'),
  paidStartsAt: timestamp('paid_starts_at'),
  trialState: text('trial_state', {
    enum: ['eligible', 'baseline', 'waiting', 'followup', 'completed', 'expired', 'cancelled'],
  })
    .notNull()
    .default('eligible'),
});

export const scanRunItems = sqliteTable(
  'scan_run_items',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => scanRuns.id, { onDelete: 'cascade' }),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    phase: text('phase', { enum: ['baseline', 'followup', 'paid'] }).notNull(),
    status: text('status', { enum: ['pending', 'running', 'succeeded', 'exhausted', 'cancelled'] })
      .notNull()
      .default('pending'),
    attemptsUsed: integer('attempts_used').notNull().default(0),
    dueAt: timestamp('due_at').notNull(),
    terminalReason: text('terminal_reason'),
  },
  (table) => [
    uniqueIndex('run_items_question_unique').on(table.runId, table.promptId),
    index('run_items_due_idx').on(table.status, table.dueAt),
  ],
);

export const productEvents = sqliteTable(
  'product_events',
  {
    id: text('id').primaryKey(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    schemaVersion: integer('schema_version').notNull().default(1),
    name: text('name').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    questionId: text('question_id'),
    observationId: text('observation_id'),
    compareToId: text('compare_to_id'),
    receivedAt: timestamp('received_at').notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
    source: text('source', { enum: ['client', 'server', 'operator'] }).notNull(),
    assisted: integer('assisted', { mode: 'boolean' }),
    propertiesJson: text('properties_json').notNull().default('{}'),
  },
  (table) => [index('events_cohort_idx').on(table.userId, table.name, table.receivedAt)],
);

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    windowStartedAt: timestamp('window_started_at').notNull(),
    count: integer('count').notNull().default(1),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => [index('rate_limits_expires_idx').on(table.expiresAt)],
);

export const projectRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  competitors: many(competitors),
  prompts: many(prompts),
  scans: many(scanRuns),
}));
export const userRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  projects: many(projects),
  subscription: one(subscriptions),
}));

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  projects,
  competitors,
  prompts,
  subscriptions,
  billingWebhookReceipts,
  scanRuns,
  scanResults,
  providerCallReservations,
  rateLimits,
  pilotEnrollments,
  scanRunItems,
  productEvents,
};

export const sqliteForeignKeys = sql`PRAGMA foreign_keys = ON`;
