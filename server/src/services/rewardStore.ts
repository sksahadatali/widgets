import { constants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkedRewardAdd,
  getRewardBalances,
} from '../rewards/rewardSelectors.js';
import type {
  RewardAwardInput,
  RewardCategory,
  RewardRelation,
  RewardReversalInput,
  RewardSource,
  RewardStoreData,
  RewardTransaction,
} from '../types/reward.js';

const DEFAULT_STORE_PATH = fileURLToPath(
  new URL(
    '../../data/rewards.local.json',
    import.meta.url
  )
);

const EMPTY_STORE: RewardStoreData = {
  schemaVersion: 1,
  transactions: [],
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT_LENGTH = 240;
const AWARD_CATEGORIES = new Set<RewardCategory>([
  'school',
  'kumon',
  'behaviour',
  'helping',
  'achievement',
  'other',
  'routine',
  'job',
  'correction',
]);
const MANUAL_AWARD_CATEGORIES = new Set<RewardCategory>([
  'school',
  'kumon',
  'behaviour',
  'helping',
  'achievement',
  'other',
]);
const MANUAL_AWARD_MAX = 100;
const MANUAL_REASON_MAX_LENGTH = 160;

type StoreUpdate<T> = {
  store: RewardStoreData;
  result: T;
  changed?: boolean;
};

export type RewardMutationResult = {
  transaction: RewardTransaction;
  created: boolean;
};

export class RewardStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RewardStoreError';
  }
}

export class RewardStoreCorruptError extends RewardStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'RewardStoreCorruptError';
  }
}

export class RewardNotFoundError extends RewardStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'RewardNotFoundError';
  }
}

export class RewardIdempotencyConflictError extends RewardStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'RewardIdempotencyConflictError';
  }
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: string[]
): boolean {
  return Object.keys(value).every(
    key => keys.includes(key)
  );
}

function isNonEmptyText(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value.trim()) &&
    value.length <= MAX_TEXT_LENGTH
  );
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(Date.parse(value))
  );
}

function isLocalDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !DATE_PATTERN.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value
    .split('-')
    .map(Number);
  const candidate = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function isTimeZone(value: unknown): value is string {
  if (!isNonEmptyText(value)) {
    return false;
  }

  try {
    new Intl.DateTimeFormat(
      'en-GB',
      { timeZone: value }
    ).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getLocalDate(
  instant: Date,
  timeZone: string
): string {
  const parts = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }
  ).formatToParts(instant);
  const part = (
    type: Intl.DateTimeFormatPartTypes
  ) => parts.find(
    candidate => candidate.type === type
  )?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');

  if (!year || !month || !day) {
    throw new RewardStoreError(
      'Unable to determine the household reward date.'
    );
  }

  return `${year}-${month}-${day}`;
}

function isRewardSource(
  value: unknown
): value is RewardSource {
  if (
    !isRecord(value) ||
    !isNonEmptyText(value.eventKey)
  ) {
    return false;
  }

  switch (value.kind) {
    case 'manual-parent-award':
      return hasOnlyKeys(value, [
        'kind',
        'eventKey',
      ]);
    case 'routine-completion':
      return (
        hasOnlyKeys(value, [
          'kind',
          'eventKey',
          'routineId',
          'occurrenceId',
          'label',
        ]) &&
        isNonEmptyText(value.routineId) &&
        isNonEmptyText(value.occurrenceId) &&
        isNonEmptyText(value.label) &&
        value.eventKey.startsWith(
          `routine-occurrence:${value.occurrenceId}:completion:`
        ) &&
        /^\d+$/.test(
          value.eventKey.slice(
            `routine-occurrence:${value.occurrenceId}:completion:`.length
          )
        ) &&
        Number(value.eventKey.slice(
          `routine-occurrence:${value.occurrenceId}:completion:`.length
        )) > 0 &&
        Number.isSafeInteger(Number(value.eventKey.slice(
          `routine-occurrence:${value.occurrenceId}:completion:`.length
        )))
      );
    case 'job-completion':
      return (
        hasOnlyKeys(value, [
          'kind',
          'eventKey',
          'jobId',
          'occurrenceId',
          'label',
        ]) &&
        isNonEmptyText(value.jobId) &&
        isNonEmptyText(value.occurrenceId) &&
        isNonEmptyText(value.label)
      );
    case 'redemption':
    case 'correction':
      return (
        hasOnlyKeys(value, [
          'kind',
          'eventKey',
          'label',
        ]) &&
        isNonEmptyText(value.label)
      );
    default:
      return false;
  }
}

function isRewardRelation(
  value: unknown
): value is RewardRelation | null {
  return (
    value === null ||
    (
      isRecord(value) &&
      hasOnlyKeys(value, [
        'kind',
        'transactionId',
      ]) &&
      (
        value.kind === 'reversal-of' ||
        value.kind === 'replacement-for'
      ) &&
      isNonEmptyText(value.transactionId)
    )
  );
}

function isRewardTransactionShape(
  value: unknown
): value is RewardTransaction {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasOnlyKeys(value, [
      'id',
      'profileId',
      'entryType',
      'currency',
      'amount',
      'category',
      'reason',
      'source',
      'relation',
      'actorProfileId',
      'createdAt',
      'localDate',
      'timeZone',
    ]) &&
    isNonEmptyText(value.id) &&
    isNonEmptyText(value.profileId) &&
    value.profileId !== 'family' &&
    (
      value.entryType === 'award' ||
      value.entryType === 'reversal' ||
      value.entryType === 'redemption'
    ) &&
    value.currency === 'star' &&
    Number.isSafeInteger(value.amount) &&
    Number(value.amount) !== 0 &&
    (
      value.category === 'school' ||
      value.category === 'kumon' ||
      value.category === 'behaviour' ||
      value.category === 'helping' ||
      value.category === 'achievement' ||
      value.category === 'other' ||
      value.category === 'routine' ||
      value.category === 'job' ||
      value.category === 'redemption' ||
      value.category === 'correction'
    ) &&
    (
      value.reason === null ||
      isNonEmptyText(value.reason)
    ) &&
    isRewardSource(value.source) &&
    isRewardRelation(value.relation) &&
    (
      value.actorProfileId === null ||
      isNonEmptyText(value.actorProfileId)
    ) &&
    isIsoTimestamp(value.createdAt) &&
    isLocalDate(value.localDate) &&
    isTimeZone(value.timeZone)
  );
}

function validateTransactionSemantics(
  transaction: RewardTransaction
): void {
  if (
    transaction.entryType === 'award' &&
    (
      transaction.amount <= 0 ||
      transaction.source.kind === 'redemption' ||
      transaction.category === 'redemption' ||
      transaction.relation?.kind === 'reversal-of'
    )
  ) {
    throw new RewardStoreCorruptError(
      'The local rewards store violates award invariants. It was not changed.'
    );
  }

  if (
    transaction.entryType === 'redemption' &&
    (
      transaction.amount >= 0 ||
      transaction.source.kind !== 'redemption' ||
      transaction.category !== 'redemption' ||
      transaction.relation !== null
    )
  ) {
    throw new RewardStoreCorruptError(
      'The local rewards store violates redemption invariants. It was not changed.'
    );
  }

  if (
    transaction.entryType === 'reversal' &&
    (
      transaction.source.kind !== 'correction' ||
      transaction.category !== 'correction' ||
      transaction.relation?.kind !== 'reversal-of'
    )
  ) {
    throw new RewardStoreCorruptError(
      'The local rewards store violates reversal invariants. It was not changed.'
    );
  }

  if (
    transaction.source.kind === 'routine-completion' &&
    transaction.category !== 'routine'
  ) {
    throw new RewardStoreCorruptError(
      'The local rewards store contains an invalid Routine source. It was not changed.'
    );
  }

  if (
    transaction.source.kind === 'job-completion' &&
    transaction.category !== 'job'
  ) {
    throw new RewardStoreCorruptError(
      'The local rewards store contains an invalid Job source. It was not changed.'
    );
  }

  if (
    transaction.source.kind === 'correction' &&
    transaction.category !== 'correction'
  ) {
    throw new RewardStoreCorruptError(
      'The local rewards store contains an invalid correction source. It was not changed.'
    );
  }

  const createdAt = new Date(transaction.createdAt);

  if (
    getLocalDate(
      createdAt,
      transaction.timeZone
    ) !== transaction.localDate
  ) {
    throw new RewardStoreCorruptError(
      'The local rewards store contains an invalid local date. It was not changed.'
    );
  }
}

function validateRelationships(
  transactions: RewardTransaction[]
): void {
  const byId = new Map(
    transactions.map(transaction => [
      transaction.id,
      transaction,
    ])
  );
  const reversedTargets = new Set<string>();

  for (const transaction of transactions) {
    const relation = transaction.relation;

    if (!relation) {
      continue;
    }

    if (relation.transactionId === transaction.id) {
      throw new RewardStoreCorruptError(
        'The local rewards store contains a self-referencing transaction. It was not changed.'
      );
    }

    const target = byId.get(relation.transactionId);

    if (!target) {
      throw new RewardStoreCorruptError(
        'The local rewards store references an unknown transaction. It was not changed.'
      );
    }

    if (relation.kind === 'reversal-of') {
      if (
        target.entryType === 'reversal' ||
        transaction.amount !== -target.amount ||
        transaction.profileId !== target.profileId ||
        transaction.currency !== target.currency ||
        reversedTargets.has(target.id)
      ) {
        throw new RewardStoreCorruptError(
          'The local rewards store violates reversal relationships. It was not changed.'
        );
      }

      reversedTargets.add(target.id);
    }
  }

  const activeRoutineOccurrenceIds = new Set<string>();
  for (const transaction of transactions) {
    if (
      transaction.entryType !== 'award' ||
      transaction.source.kind !== 'routine-completion' ||
      reversedTargets.has(transaction.id)
    ) {
      continue;
    }

    if (
      activeRoutineOccurrenceIds.has(
        transaction.source.occurrenceId
      )
    ) {
      throw new RewardStoreCorruptError(
        'The local rewards store contains multiple active awards for one Routine occurrence. It was not changed.'
      );
    }
    activeRoutineOccurrenceIds.add(
      transaction.source.occurrenceId
    );
  }
}

export function validateRewardStore(
  value: unknown
): RewardStoreData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.transactions) ||
    !value.transactions.every(
      isRewardTransactionShape
    )
  ) {
    throw new RewardStoreCorruptError(
      'The local rewards store is malformed or has an unsupported schema. It was not changed.'
    );
  }

  const transactions =
    value.transactions as RewardTransaction[];
  const transactionIds = transactions.map(
    transaction => transaction.id
  );
  const eventKeys = transactions.map(
    transaction => transaction.source.eventKey
  );

  if (
    new Set(transactionIds).size !==
      transactionIds.length ||
    new Set(eventKeys).size !== eventKeys.length
  ) {
    throw new RewardStoreCorruptError(
      'The local rewards store contains duplicate transaction or event IDs. It was not changed.'
    );
  }

  transactions.forEach(
    validateTransactionSemantics
  );
  validateRelationships(transactions);

  try {
    getRewardBalances(transactions);
    transactions.reduce(
      (aggregate, transaction) =>
        checkedRewardAdd(
          aggregate,
          transaction.amount
        ),
      0
    );
  } catch {
    throw new RewardStoreCorruptError(
      'The local rewards store exceeds the supported numeric range. It was not changed.'
    );
  }

  return value as RewardStoreData;
}

function normalizeText(
  value: unknown,
  field: string,
  allowNull = false
): string | null {
  if (allowNull && value === null) {
    return null;
  }

  if (!isNonEmptyText(value)) {
    throw new RewardStoreError(
      `Reward ${field} is invalid.`
    );
  }

  return value.trim();
}

function normalizeTimeZone(value: unknown): string {
  if (!isTimeZone(value)) {
    throw new RewardStoreError(
      'Reward timezone is invalid.'
    );
  }

  return value.trim();
}

function normalizeAwardInput(
  input: unknown
): RewardAwardInput {
  if (!isRecord(input)) {
    throw new RewardStoreError(
      'Reward award details are invalid.'
    );
  }

  const profileId = normalizeText(
    input.profileId,
    'recipient'
  ) as string;

  if (profileId === 'family') {
    throw new RewardStoreError(
      'Family cannot receive a Reward transaction.'
    );
  }

  if (
    !Number.isSafeInteger(input.amount) ||
    Number(input.amount) <= 0
  ) {
    throw new RewardStoreError(
      'Reward award amount must be a positive safe integer.'
    );
  }

  if (
    typeof input.category !== 'string' ||
    !AWARD_CATEGORIES.has(
      input.category as RewardCategory
    )
  ) {
    throw new RewardStoreError(
      'Reward category is invalid.'
    );
  }

  if (!isRewardSource(input.source)) {
    throw new RewardStoreError(
      'Reward source is invalid.'
    );
  }

  const source: RewardSource =
    input.source.kind === 'manual-parent-award'
      ? {
        kind: input.source.kind,
        eventKey: input.source.eventKey.trim(),
      }
      : input.source.kind === 'routine-completion'
        ? {
          kind: input.source.kind,
          eventKey: input.source.eventKey.trim(),
          routineId: input.source.routineId.trim(),
          occurrenceId:
            input.source.occurrenceId.trim(),
          label: input.source.label.trim(),
        }
        : input.source.kind === 'job-completion'
          ? {
            kind: input.source.kind,
            eventKey: input.source.eventKey.trim(),
            jobId: input.source.jobId.trim(),
            occurrenceId:
              input.source.occurrenceId.trim(),
            label: input.source.label.trim(),
          }
          : {
            kind: input.source.kind,
            eventKey: input.source.eventKey.trim(),
            label: input.source.label.trim(),
          };

  if (source.kind === 'redemption') {
    throw new RewardStoreError(
      'Redemption cannot be created through the award operation.'
    );
  }

  if (
    source.kind === 'routine-completion' &&
    input.category !== 'routine' ||
    source.kind === 'job-completion' &&
    input.category !== 'job' ||
    source.kind === 'correction' &&
    input.category !== 'correction'
  ) {
    throw new RewardStoreError(
      'Reward source and category do not match.'
    );
  }

  return {
    profileId,
    amount: Number(input.amount),
    category: input.category as RewardAwardInput['category'],
    reason: normalizeText(
      input.reason,
      'reason',
      true
    ),
    source: structuredClone(
      source
    ) as RewardAwardInput['source'],
    actorProfileId:
      input.actorProfileId === null
        ? null
        : normalizeText(
          input.actorProfileId,
          'actor'
        ) as string,
    timeZone: normalizeTimeZone(input.timeZone),
  };
}

function normalizeManualAwardInput(
  input: unknown
): RewardAwardInput {
  const normalized = normalizeAwardInput(input);

  if (
    normalized.source.kind !==
      'manual-parent-award' ||
    !normalized.source.eventKey.startsWith(
      'manual-award:'
    ) ||
    !normalized.source.eventKey.slice(
      'manual-award:'.length
    ).trim()
  ) {
    throw new RewardStoreError(
      'Manual Reward event key is invalid.'
    );
  }

  if (
    normalized.amount > MANUAL_AWARD_MAX
  ) {
    throw new RewardStoreError(
      'Manual Reward amount must be from 1 to 100.'
    );
  }

  if (
    !MANUAL_AWARD_CATEGORIES.has(
      normalized.category
    )
  ) {
    throw new RewardStoreError(
      'Manual Reward category is invalid.'
    );
  }

  if (
    normalized.reason === null ||
    normalized.reason.length >
      MANUAL_REASON_MAX_LENGTH
  ) {
    throw new RewardStoreError(
      'Manual Reward reason is required and must be 160 characters or fewer.'
    );
  }

  if (
    normalized.actorProfileId === null ||
    normalized.actorProfileId === 'family'
  ) {
    throw new RewardStoreError(
      'Manual Reward actor context is invalid.'
    );
  }

  return normalized;
}

function normalizeReversalInput(
  input: unknown
): RewardReversalInput {
  if (!isRecord(input)) {
    throw new RewardStoreError(
      'Reward reversal details are invalid.'
    );
  }

  return {
    eventKey: normalizeText(
      input.eventKey,
      'event key'
    ) as string,
    reason: normalizeText(
      input.reason,
      'reversal reason'
    ) as string,
    actorProfileId:
      input.actorProfileId === null
        ? null
        : normalizeText(
          input.actorProfileId,
          'actor'
        ) as string,
    timeZone: normalizeTimeZone(input.timeZone),
  };
}

function equivalentSource(
  left: RewardSource,
  right: RewardSource
): boolean {
  if (
    left.kind !== right.kind ||
    left.eventKey !== right.eventKey
  ) {
    return false;
  }

  if (
    left.kind === 'manual-parent-award' &&
    right.kind === 'manual-parent-award'
  ) {
    return true;
  }

  if (
    left.kind === 'routine-completion' &&
    right.kind === 'routine-completion'
  ) {
    return (
      left.routineId === right.routineId &&
      left.occurrenceId === right.occurrenceId &&
      left.label === right.label
    );
  }

  if (
    left.kind === 'job-completion' &&
    right.kind === 'job-completion'
  ) {
    return (
      left.jobId === right.jobId &&
      left.occurrenceId === right.occurrenceId &&
      left.label === right.label
    );
  }

  if (
    (
      left.kind === 'redemption' ||
      left.kind === 'correction'
    ) &&
    left.kind === right.kind
  ) {
    return left.label === right.label;
  }

  return false;
}

function equivalentAward(
  transaction: RewardTransaction,
  input: RewardAwardInput
): boolean {
  return (
    transaction.entryType === 'award' &&
    transaction.profileId === input.profileId &&
    transaction.currency === 'star' &&
    transaction.amount === input.amount &&
    transaction.category === input.category &&
    transaction.reason === input.reason &&
    transaction.actorProfileId ===
      input.actorProfileId &&
    transaction.timeZone === input.timeZone &&
    equivalentSource(
      transaction.source,
      input.source
    ) &&
    transaction.relation === null
  );
}

function equivalentReversal(
  transaction: RewardTransaction,
  target: RewardTransaction,
  input: RewardReversalInput
): boolean {
  return (
    transaction.entryType === 'reversal' &&
    transaction.profileId === target.profileId &&
    transaction.currency === target.currency &&
    transaction.amount === -target.amount &&
    transaction.category === 'correction' &&
    transaction.reason === input.reason &&
    transaction.actorProfileId ===
      input.actorProfileId &&
    transaction.timeZone === input.timeZone &&
    transaction.source.kind === 'correction' &&
    transaction.source.eventKey === input.eventKey &&
    transaction.source.label === 'Reward reversal' &&
    transaction.relation?.kind === 'reversal-of' &&
    transaction.relation.transactionId === target.id
  );
}

function assertAppendWithinRange(
  transactions: RewardTransaction[],
  profileId: string,
  amount: number
): void {
  try {
    const balances = getRewardBalances(transactions);
    checkedRewardAdd(
      balances[profileId] ?? 0,
      amount
    );
    const aggregate = transactions.reduce(
      (total, transaction) =>
        checkedRewardAdd(
          total,
          transaction.amount
        ),
      0
    );
    checkedRewardAdd(aggregate, amount);
  } catch {
    throw new RewardStoreError(
      'Reward transaction would exceed the supported numeric range.'
    );
  }
}

async function fileExists(
  filePath: string
): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export class RewardFileStore {
  private writeQueue: Promise<void> =
    Promise.resolve();

  constructor(
    private readonly filePath =
      DEFAULT_STORE_PATH
  ) {}

  get backupPath(): string {
    return `${this.filePath}.bak`;
  }

  private async readExisting(): Promise<
    RewardStoreData | null
  > {
    let raw: string;

    try {
      raw = await readFile(
        this.filePath,
        'utf8'
      );
    } catch (error) {
      if (
        isRecord(error) &&
        error.code === 'ENOENT'
      ) {
        return null;
      }

      throw error;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new RewardStoreCorruptError(
        'The local rewards store is malformed. It was not changed.'
      );
    }

    return validateRewardStore(parsed);
  }

  async read(): Promise<RewardStoreData> {
    return this.mutate(store => ({
      store,
      result: structuredClone(store),
      changed: false,
    }));
  }

  private async replace(
    nextStore: RewardStoreData,
    retainBackup: boolean
  ): Promise<void> {
    validateRewardStore(nextStore);

    await mkdir(dirname(this.filePath), {
      recursive: true,
    });

    const suffix =
      `${process.pid}.${Date.now()}`;
    const temporaryPath =
      `${this.filePath}.${suffix}.tmp`;
    const backupTemporaryPath =
      `${this.backupPath}.${suffix}.tmp`;

    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(nextStore, null, 2)}\n`,
        {
          encoding: 'utf8',
          flag: 'wx',
        }
      );

      if (
        retainBackup &&
        await fileExists(this.filePath)
      ) {
        await copyFile(
          this.filePath,
          backupTemporaryPath
        );
        await rename(
          backupTemporaryPath,
          this.backupPath
        );
      }

      await rename(
        temporaryPath,
        this.filePath
      );
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch {
        // The temporary file may already have been renamed.
      }

      try {
        await unlink(backupTemporaryPath);
      } catch {
        // The backup temporary file may already have been renamed.
      }

      throw error;
    }
  }

  private async mutate<T>(
    update: (
      store: RewardStoreData
    ) => StoreUpdate<T>
  ): Promise<T> {
    let operationResult: T | undefined;
    let operationError: unknown;

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          const existing =
            await this.readExisting();
          const current = existing ??
            structuredClone(EMPTY_STORE);
          const updated = update(
            structuredClone(current)
          );

          validateRewardStore(updated.store);

          if (
            updated.changed !== false ||
            existing === null
          ) {
            await this.replace(
              updated.store,
              existing !== null
            );
          }

          operationResult = updated.result;
        } catch (error) {
          operationError = error;
        }
      });

    await this.writeQueue;

    if (operationError) {
      throw operationError;
    }

    return operationResult as T;
  }

  async appendAward(
    id: string,
    input: unknown,
    now = new Date()
  ): Promise<RewardMutationResult> {
    const normalized = normalizeAwardInput(input);
    const createdAt = now.toISOString();

    return this.mutate<RewardMutationResult>(store => {
      const existingEvent =
        store.transactions.find(
          transaction =>
            transaction.source.eventKey ===
              normalized.source.eventKey
        );

      if (existingEvent) {
        if (
          equivalentAward(
            existingEvent,
            normalized
          )
        ) {
          return {
            store,
            result: {
              transaction: existingEvent,
              created: false,
            },
            changed: false,
          };
        }

        throw new RewardIdempotencyConflictError(
          'Reward event key is already used by a different request.'
        );
      }

      if (
        !isNonEmptyText(id) ||
        store.transactions.some(
          transaction => transaction.id === id
        )
      ) {
        throw new RewardStoreError(
          'Reward transaction ID is invalid or already exists.'
        );
      }

      const transaction: RewardTransaction = {
        id: id.trim(),
        profileId: normalized.profileId,
        entryType: 'award',
        currency: 'star',
        amount: normalized.amount,
        category: normalized.category,
        reason: normalized.reason,
        source: structuredClone(normalized.source),
        relation: null,
        actorProfileId:
          normalized.actorProfileId,
        createdAt,
        localDate: getLocalDate(
          now,
          normalized.timeZone
        ),
        timeZone: normalized.timeZone,
      };

      assertAppendWithinRange(
        store.transactions,
        transaction.profileId,
        transaction.amount
      );
      store.transactions.push(transaction);

      return {
        store,
        result: {
          transaction,
          created: true,
        },
      };
    });
  }

  async appendManualAward(
    id: string,
    input: unknown,
    now = new Date()
  ): Promise<RewardMutationResult> {
    return this.appendAward(
      id,
      normalizeManualAwardInput(input),
      now
    );
  }

  async reverseTransaction(
    id: string,
    targetId: string,
    input: unknown,
    now = new Date()
  ): Promise<RewardMutationResult> {
    const normalized =
      normalizeReversalInput(input);
    const createdAt = now.toISOString();

    return this.mutate<RewardMutationResult>(store => {
      if (
        !isNonEmptyText(targetId) ||
        !isNonEmptyText(id)
      ) {
        throw new RewardStoreError(
          'Reward reversal transaction IDs are invalid.'
        );
      }

      if (id.trim() === targetId.trim()) {
        throw new RewardStoreError(
          'A Reward transaction cannot reverse itself.'
        );
      }

      const target = store.transactions.find(
        transaction =>
          transaction.id === targetId.trim()
      );

      if (!target) {
        throw new RewardNotFoundError(
          'Reward transaction was not found.'
        );
      }

      const existingEvent =
        store.transactions.find(
          transaction =>
            transaction.source.eventKey ===
              normalized.eventKey
        );

      if (existingEvent) {
        if (
          equivalentReversal(
            existingEvent,
            target,
            normalized
          )
        ) {
          return {
            store,
            result: {
              transaction: existingEvent,
              created: false,
            },
            changed: false,
          };
        }

        throw new RewardIdempotencyConflictError(
          'Reward event key is already used by a different request.'
        );
      }

      if (
        store.transactions.some(
          transaction => transaction.id === id.trim()
        )
      ) {
        throw new RewardStoreError(
          'Reward transaction ID already exists.'
        );
      }

      if (target.entryType === 'reversal') {
        throw new RewardStoreError(
          'A Reward reversal cannot reverse another reversal.'
        );
      }

      if (
        store.transactions.some(
          transaction =>
            transaction.relation?.kind ===
              'reversal-of' &&
            transaction.relation.transactionId ===
              target.id
        )
      ) {
        throw new RewardStoreError(
          'Reward transaction has already been reversed.'
        );
      }

      const transaction: RewardTransaction = {
        id: id.trim(),
        profileId: target.profileId,
        entryType: 'reversal',
        currency: target.currency,
        amount: -target.amount,
        category: 'correction',
        reason: normalized.reason,
        source: {
          kind: 'correction',
          eventKey: normalized.eventKey,
          label: 'Reward reversal',
        },
        relation: {
          kind: 'reversal-of',
          transactionId: target.id,
        },
        actorProfileId:
          normalized.actorProfileId,
        createdAt,
        localDate: getLocalDate(
          now,
          normalized.timeZone
        ),
        timeZone: normalized.timeZone,
      };

      assertAppendWithinRange(
        store.transactions,
        transaction.profileId,
        transaction.amount
      );
      store.transactions.push(transaction);

      return {
        store,
        result: {
          transaction,
          created: true,
        },
      };
    });
  }
}

export const rewardStore = new RewardFileStore();
