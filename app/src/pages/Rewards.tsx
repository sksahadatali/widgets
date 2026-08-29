import {
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  Gift,
  History,
  RefreshCw,
  RotateCcw,
  Star,
  Users,
} from 'lucide-react';

import {
  useHouseholdProfile,
} from '../household/useHouseholdProfile';
import {
  getRewardBalances,
} from '../rewards/rewardSelectors';
import {
  MANUAL_REWARD_CATEGORIES,
  canManageRewards,
  getEligibleRewardRecipients,
  getReversedRewardIds,
  selectRewardBalanceProfiles,
  selectVisibleRewardHistory,
  validateManualAward,
} from '../rewards/manualRewards';
import {
  useRewardContext,
} from '../rewards/useRewardContext';
import {
  getHouseholdConfig,
} from '../services/householdConfigService';
import type {
  ManualRewardCategory,
  RewardTransaction,
} from '../types/reward';
import RedemptionWorkspace from '../components/rewards/RedemptionWorkspace';

import './Rewards.css';

const INITIAL_HISTORY_LIMIT = 50;

function formatCategory(category: string): string {
  return category.charAt(0).toUpperCase() +
    category.slice(1);
}

function formatTransactionTime(
  transaction: RewardTransaction
): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: transaction.timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(transaction.createdAt));
}

function formatLocalDate(localDate: string): string {
  const [year, month, day] = localDate
    .split('-')
    .map(Number);

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function sourceLabel(transaction: RewardTransaction): string {
  switch (transaction.source.kind) {
    case 'manual-parent-award':
      return 'Manual award';
    case 'correction':
      return 'Correction';
    case 'routine-completion':
      return 'Routine reward';
    case 'job-completion':
      return 'Job reward';
    case 'redemption':
      return 'Redemption';
  }
}

export default function Rewards() {
  const {
    profiles,
    selectedProfile,
  } = useHouseholdProfile();
  const {
    transactions,
    loading,
    saving,
    error,
    refresh,
    giveStars,
    reverseAward,
  } = useRewardContext();
  const recipients = useMemo(
    () => getEligibleRewardRecipients(profiles),
    [profiles]
  );
  const canManage = canManageRewards(
    selectedProfile
  );
  const balanceProfiles = useMemo(
    () => selectRewardBalanceProfiles(
      profiles,
      selectedProfile
    ),
    [profiles, selectedProfile]
  );
  const balances = useMemo(
    () => getRewardBalances(transactions),
    [transactions]
  );
  const visibleHistory = useMemo(
    () => selectVisibleRewardHistory({
      transactions,
      profiles,
      selectedProfile,
    }),
    [transactions, profiles, selectedProfile]
  );
  const reversedIds = useMemo(
    () => getReversedRewardIds(transactions),
    [transactions]
  );
  const transactionsById = useMemo(
    () => new Map(
      transactions.map(transaction => [
        transaction.id,
        transaction,
      ])
    ),
    [transactions]
  );
  const namesById = useMemo(
    () => new Map(
      profiles.map(profile => [
        profile.id,
        profile.displayName,
      ])
    ),
    [profiles]
  );
  const [recipientId, setRecipientId] =
    useState(recipients[0]?.id ?? '');
  const effectiveRecipientId = recipients.some(
    recipient => recipient.id === recipientId
  )
    ? recipientId
    : recipients[0]?.id ?? '';
  const [amount, setAmount] = useState('10');
  const [category, setCategory] =
    useState<ManualRewardCategory>('helping');
  const [reason, setReason] = useState('');
  const [formError, setFormError] =
    useState<string | null>(null);
  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);
  const [visibleCount, setVisibleCount] =
    useState(INITIAL_HISTORY_LIMIT);
  const awardRequestId = useRef<string | null>(null);
  const reversalRequestIds = useRef(
    new Map<string, string>()
  );
  const timeZone =
    getHouseholdConfig().location.timezone;

  const submitAward = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!canManage) {
      setFormError(
        'Select an adult profile to give stars.'
      );
      return;
    }

    if (!recipients.some(
      recipient => recipient.id === effectiveRecipientId
    )) {
      setFormError('Choose a current child recipient.');
      return;
    }

    const requestId = awardRequestId.current ??
      crypto.randomUUID();
    awardRequestId.current = requestId;

    try {
      const input = validateManualAward({
        profileId: effectiveRecipientId,
        amount: Number(amount),
        category,
        reason,
        actorProfileId: selectedProfile.id,
        timeZone,
        requestId,
      });

      await giveStars(input);
      awardRequestId.current = null;
      setReason('');
      setSuccessMessage(
        `${input.amount} stars were added.`
      );
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to give stars.'
      );
    }
  };

  const reverse = async (
    transaction: RewardTransaction
  ) => {
    const recipientName =
      namesById.get(transaction.profileId) ??
      'a removed household profile';
    const confirmed = window.confirm(
      `Reverse the ${transaction.amount}-star ${formatCategory(transaction.category)} award for ${recipientName}? The original award will remain in the audit history and an opposite correction will be added.`
    );

    if (!confirmed) {
      return;
    }

    const requestId =
      reversalRequestIds.current.get(transaction.id) ??
      crypto.randomUUID();
    reversalRequestIds.current.set(
      transaction.id,
      requestId
    );
    setFormError(null);

    try {
      await reverseAward({
        transactionId: transaction.id,
        actorProfileId: selectedProfile.id,
        timeZone,
        requestId,
      });
      reversalRequestIds.current.delete(transaction.id);
      setSuccessMessage('The award was reversed.');
    } catch (reverseError) {
      setFormError(
        reverseError instanceof Error
          ? reverseError.message
          : 'Unable to reverse this award.'
      );
    }
  };

  const groupedHistory = visibleHistory
    .slice(0, visibleCount)
    .reduce<Map<string, RewardTransaction[]>>(
      (groups, transaction) => {
        const group = groups.get(transaction.localDate) ?? [];
        group.push(transaction);
        groups.set(transaction.localDate, group);
        return groups;
      },
      new Map()
    );

  return (
    <main className="rewards-page">
      <header className="rewards-page__header">
        <div>
          <p className="rewards-page__eyebrow">
            Family Rewards
          </p>
          <h1>Rewards</h1>
          <p>
            Celebrate helpful choices and achievements with stars.
          </p>
        </div>
        <Gift size={34} aria-hidden="true" />
      </header>

      {error && (
        <div className="rewards-message rewards-message--error" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="rewards-button rewards-button--secondary"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw size={18} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      <p className="rewards-sr-status" aria-live="polite">
        {successMessage}
      </p>

      {loading ? (
        <section className="rewards-panel" aria-busy="true">
          <p>Loading Rewards…</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="reward-balances-title">
            <div className="rewards-section-heading">
              <div>
                <h2 id="reward-balances-title">Star balances</h2>
                <p>Calculated from the append-only Rewards ledger.</p>
              </div>
              <Users size={24} aria-hidden="true" />
            </div>

            <div className="reward-balances">
              {balanceProfiles.length === 0 ? (
                <p className="rewards-empty">
                  No child profiles are currently configured.
                </p>
              ) : balanceProfiles.map(profile => (
                <article className="reward-balance-card" key={profile.id}>
                  <span>{profile.displayName}</span>
                  <strong>
                    <Star size={22} fill="currentColor" aria-hidden="true" />
                    {balances[profile.id] ?? 0}
                  </strong>
                </article>
              ))}
            </div>
          </section>

          <RedemptionWorkspace />

          {canManage && (
            <section className="rewards-panel" aria-labelledby="give-stars-title">
              <div className="rewards-section-heading">
                <div>
                  <h2 id="give-stars-title">Give Stars</h2>
                  <p>
                    The selected adult profile is recorded as context, not authentication.
                  </p>
                </div>
                <Star size={24} aria-hidden="true" />
              </div>

              <form className="give-stars-form" onSubmit={submitAward} noValidate>
                <label>
                  <span>To</span>
                  <select
                    value={effectiveRecipientId}
                    onChange={event => setRecipientId(event.target.value)}
                    required
                    disabled={saving || recipients.length === 0}
                  >
                    {recipients.map(recipient => (
                      <option key={recipient.id} value={recipient.id}>
                        {recipient.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Stars</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="100"
                    step="1"
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                    required
                    disabled={saving}
                  />
                </label>

                <label>
                  <span>Category</span>
                  <select
                    value={category}
                    onChange={event => setCategory(
                      event.target.value as ManualRewardCategory
                    )}
                    required
                    disabled={saving}
                  >
                    {MANUAL_REWARD_CATEGORIES.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="give-stars-form__reason">
                  <span>Reason</span>
                  <input
                    type="text"
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    maxLength={160}
                    autoComplete="off"
                    placeholder="What are you celebrating?"
                    required
                    disabled={saving}
                    aria-describedby="reward-reason-help"
                  />
                  <small id="reward-reason-help">
                    Required · {reason.length}/160 characters
                  </small>
                </label>

                <button
                  type="submit"
                  className="rewards-button rewards-button--primary"
                  disabled={saving || recipients.length === 0}
                >
                  <Star size={18} fill="currentColor" aria-hidden="true" />
                  {saving ? 'Giving…' : `Give ${amount || '0'} ★`}
                </button>
              </form>
            </section>
          )}

          {formError && (
            <div className="rewards-message rewards-message--error" role="alert">
              <AlertTriangle size={20} aria-hidden="true" />
              {formError}
            </div>
          )}

          <section className="rewards-panel" aria-labelledby="reward-history-title">
            <div className="rewards-section-heading">
              <div>
                <h2 id="reward-history-title">Recent Activity</h2>
                <p>
                  {canManage
                    ? 'Includes retained records for removed profiles.'
                    : 'Activity visible in the selected household context.'}
                </p>
              </div>
              <History size={24} aria-hidden="true" />
            </div>

            {visibleHistory.length === 0 ? (
              <p className="rewards-empty">No Reward activity yet.</p>
            ) : (
              <div className="reward-history">
                {[...groupedHistory].map(([localDate, items]) => (
                  <section key={localDate} className="reward-history-group">
                    <h3>{formatLocalDate(localDate)}</h3>
                    <ul>
                      {items.map(transaction => {
                        const recipientName =
                          namesById.get(transaction.profileId) ??
                          'Removed profile';
                        const canReverse =
                          canManage &&
                          transaction.entryType === 'award' &&
                          transaction.source.kind ===
                            'manual-parent-award' &&
                          !reversedIds.has(transaction.id);

                        return (
                          <li key={transaction.id} className="reward-history-item">
                            <div className="reward-history-item__amount">
                              <strong className={transaction.amount < 0 ? 'is-negative' : ''}>
                                {transaction.amount > 0 ? '+' : ''}{transaction.amount} ★
                              </strong>
                              <span>{formatTransactionTime(transaction)}</span>
                            </div>
                            <div className="reward-history-item__details">
                              <div>
                                <strong>{formatCategory(transaction.category)}</strong>
                                <span>{recipientName} · {sourceLabel(transaction)}</span>
                              </div>
                              {transaction.reason && <p>{transaction.reason}</p>}
                              {transaction.relation?.kind === 'reversal-of' && (
                                <small>
                                  {transactionsById.get(
                                    transaction.relation.transactionId
                                  )?.entryType === 'redemption'
                                    ? 'Refunds an earlier redemption.'
                                    : 'Reverses an earlier award.'}
                                </small>
                              )}
                            </div>
                            {canReverse && (
                              <button
                                type="button"
                                className="rewards-button rewards-button--danger"
                                onClick={() => void reverse(transaction)}
                                disabled={saving}
                                aria-label={`Reverse ${transaction.amount}-star ${formatCategory(transaction.category)} award for ${recipientName}`}
                              >
                                <RotateCcw size={17} aria-hidden="true" />
                                Reverse award
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            {visibleHistory.length > visibleCount && (
              <button
                type="button"
                className="rewards-button rewards-button--secondary rewards-show-more"
                onClick={() => setVisibleCount(count => count + INITIAL_HISTORY_LIMIT)}
              >
                Show more activity
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}
