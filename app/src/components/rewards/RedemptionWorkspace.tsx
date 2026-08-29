import {
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  Gift,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';

import { useRedemptions } from '../../hooks/useRedemptions';
import { useHouseholdProfile } from '../../household/useHouseholdProfile';
import { canManageRewards } from '../../rewards/manualRewards';
import {
  getRedemptionRequestStatus,
  selectActiveCatalogue,
  selectVisibleRedemptionRequests,
} from '../../redemptions/redemptionSelectors';
import { getHouseholdConfig } from '../../services/householdConfigService';
import type {
  RewardCatalogueItem,
} from '../../types/redemption';

import './RedemptionWorkspace.css';

const INITIAL_REQUEST_LIMIT = 25;

function formatLocalDate(
  localDate: string
): string {
  const [year, month, day] = localDate
    .split('-')
    .map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(
    year,
    month - 1,
    day
  )));
}

function validateCatalogueForm({
  name,
  description,
  starCost,
}: {
  name: string;
  description: string;
  starCost: string;
}) {
  const normalizedName = name.trim();
  const normalizedDescription =
    description.trim() || null;
  const cost = Number(starCost);
  if (!normalizedName || normalizedName.length > 80) {
    throw new Error(
      'Name must be from 1 to 80 characters.'
    );
  }
  if (
    normalizedDescription &&
    normalizedDescription.length > 240
  ) {
    throw new Error(
      'Description must be 240 characters or fewer.'
    );
  }
  if (
    !Number.isInteger(cost) ||
    cost < 1 ||
    cost > 500
  ) {
    throw new Error(
      'Cost must be a whole number from 1 to 500 stars.'
    );
  }
  return {
    name: normalizedName,
    description: normalizedDescription,
    starCost: cost,
  };
}

export default function RedemptionWorkspace() {
  const {
    profiles,
    selectedProfile,
  } = useHouseholdProfile();
  const {
    catalogue,
    requests,
    loading,
    saving,
    error,
    refresh,
    createCatalogueItem,
    updateCatalogueItem,
    setCatalogueItemActive,
    reorderCatalogue,
    createRequest,
    cancelRequest,
    declineRequest,
  } = useRedemptions();
  const canManage = canManageRewards(selectedProfile);
  const isChild = selectedProfile.kind === 'member' &&
    selectedProfile.memberType === 'child';
  const activeCatalogue = useMemo(
    () => selectActiveCatalogue(catalogue),
    [catalogue]
  );
  const visibleRequests = useMemo(
    () => selectVisibleRedemptionRequests({
      requests,
      profiles,
      selectedProfile,
    }),
    [requests, profiles, selectedProfile]
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
  const [visibleCount, setVisibleCount] =
    useState(INITIAL_REQUEST_LIMIT);
  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);
  const [formError, setFormError] =
    useState<string | null>(null);
  const [editingId, setEditingId] =
    useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] =
    useState('');
  const [starCost, setStarCost] =
    useState('20');
  const createItemId = useRef<string | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const timeZone =
    getHouseholdConfig().location.timezone;

  const clearMessages = () => {
    setFormError(null);
    setSuccessMessage(null);
  };

  const resetEditor = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setStarCost('20');
    createItemId.current = null;
  };

  const edit = (item: RewardCatalogueItem) => {
    clearMessages();
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description ?? '');
    setStarCost(String(item.starCost));
  };

  const submitCatalogue = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    clearMessages();
    if (!canManage) {
      setFormError(
        'Select an adult profile to manage the catalogue.'
      );
      return;
    }
    try {
      const input = validateCatalogueForm({
        name,
        description,
        starCost,
      });
      if (editingId) {
        await updateCatalogueItem(editingId, input);
        setSuccessMessage('Catalogue item updated.');
      } else {
        const id = createItemId.current ??
          crypto.randomUUID();
        createItemId.current = id;
        await createCatalogueItem({ id, ...input });
        setSuccessMessage('Catalogue item created.');
      }
      resetEditor();
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to save the catalogue item.'
      );
    }
  };

  const requestItem = async (
    item: RewardCatalogueItem
  ) => {
    clearMessages();
    if (!isChild) {
      setFormError(
        'Select a child profile to request a reward.'
      );
      return;
    }
    if (!window.confirm(
      `Request “${item.name}” for ${item.starCost} stars? This request will not deduct or reserve stars.`
    )) return;
    const id = requestIds.current.get(item.id) ??
      crypto.randomUUID();
    requestIds.current.set(item.id, id);
    try {
      await createRequest({
        id,
        catalogueItemId: item.id,
        profileId: selectedProfile.id,
        requestedByProfileId: selectedProfile.id,
        timeZone,
      });
      requestIds.current.delete(item.id);
      setSuccessMessage(
        'Reward request submitted. No stars were deducted.'
      );
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to submit the request.'
      );
    }
  };

  const cancel = async (requestId: string) => {
    clearMessages();
    if (!isChild) return;
    if (!window.confirm(
      'Cancel this pending request? No stars will be changed.'
    )) return;
    try {
      await cancelRequest(
        requestId,
        selectedProfile.id
      );
      setSuccessMessage('Request cancelled.');
    } catch (cancelError) {
      setFormError(
        cancelError instanceof Error
          ? cancelError.message
          : 'Unable to cancel the request.'
      );
    }
  };

  const decline = async (requestId: string) => {
    clearMessages();
    if (!canManage) return;
    if (!window.confirm(
      'Decline this pending request? No stars will be changed.'
    )) return;
    try {
      await declineRequest(
        requestId,
        selectedProfile.id
      );
      setSuccessMessage('Request declined.');
    } catch (declineError) {
      setFormError(
        declineError instanceof Error
          ? declineError.message
          : 'Unable to decline the request.'
      );
    }
  };

  const move = async (
    index: number,
    direction: -1 | 1
  ) => {
    const target = index + direction;
    if (target < 0 || target >= catalogue.length) return;
    clearMessages();
    const ids = catalogue.map(item => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderCatalogue(ids);
      setSuccessMessage('Catalogue order updated.');
    } catch (moveError) {
      setFormError(
        moveError instanceof Error
          ? moveError.message
          : 'Unable to reorder the catalogue.'
      );
    }
  };

  const toggleActive = async (
    item: RewardCatalogueItem
  ) => {
    clearMessages();
    try {
      await setCatalogueItemActive(
        item.id,
        !item.active
      );
      setSuccessMessage(
        item.active
          ? 'Catalogue item deactivated.'
          : 'Catalogue item reactivated.'
      );
    } catch (activeError) {
      setFormError(
        activeError instanceof Error
          ? activeError.message
          : 'Unable to change the catalogue item.'
      );
    }
  };

  return (
    <div className="redemption-workspace">
      <p className="redemption-workspace__status" aria-live="polite">
        {successMessage}
      </p>

      {error && (
        <div className="redemption-message redemption-message--error" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="rewards-button rewards-button--secondary"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            Retry Redemptions
          </button>
        </div>
      )}

      {formError && (
        <div className="redemption-message redemption-message--error" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          {formError}
        </div>
      )}

      <section className="rewards-panel" aria-labelledby="redeem-stars-title">
        <div className="rewards-section-heading">
          <div>
            <h2 id="redeem-stars-title">Redeem Stars</h2>
            <p>
              Requests do not deduct or reserve stars. Adult approval will be introduced separately.
            </p>
          </div>
          <Gift size={24} aria-hidden="true" />
        </div>

        {loading ? (
          <p className="rewards-empty">Loading catalogue…</p>
        ) : activeCatalogue.length === 0 ? (
          <p className="rewards-empty">No active rewards are currently available.</p>
        ) : (
          <div className="redemption-catalogue">
            {activeCatalogue.map(item => (
              <article className="redemption-card" key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  {item.description && <p>{item.description}</p>}
                </div>
                <strong>{item.starCost} ★</strong>
                {isChild && (
                  <button
                    type="button"
                    className="rewards-button rewards-button--primary"
                    onClick={() => void requestItem(item)}
                    disabled={saving}
                  >
                    <Gift size={17} aria-hidden="true" />
                    Request reward
                  </button>
                )}
              </article>
            ))}
          </div>
        )}

        {selectedProfile.kind === 'family' && (
          <p className="redemption-note">
            Select a child profile to request a reward. Family does not identify which child would redeem it.
          </p>
        )}
      </section>

      <section className="rewards-panel" aria-labelledby="redemption-requests-title">
        <div className="rewards-section-heading">
          <div>
            <h2 id="redemption-requests-title">
              {canManage || selectedProfile.kind === 'family'
                ? 'Redemption Requests'
                : 'My Reward Requests'}
            </h2>
            <p>
              {canManage
                ? 'Adult profile context can decline pending requests. It is not authentication.'
                : 'Only requests visible in the selected household context are shown.'}
            </p>
          </div>
        </div>

        {visibleRequests.length === 0 ? (
          <p className="rewards-empty">No reward requests yet.</p>
        ) : (
          <ul className="redemption-requests">
            {visibleRequests
              .slice(0, visibleCount)
              .map(request => {
                const status = getRedemptionRequestStatus(request);
                const profileName = namesById.get(request.profileId) ??
                  'Removed profile';
                return (
                  <li
                    key={request.id}
                    className={`redemption-request redemption-request--${status}`}
                  >
                    <div className="redemption-request__main">
                      <strong>{request.contract.name}</strong>
                      <span>
                        {profileName} · {request.contract.starCost} ★ · {formatLocalDate(request.localDate)}
                      </span>
                      {request.contract.description && (
                        <p>{request.contract.description}</p>
                      )}
                    </div>
                    <span className={`redemption-status redemption-status--${status}`}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    {status === 'requested' && isChild &&
                      request.profileId === selectedProfile.id && (
                      <button
                        type="button"
                        className="rewards-button rewards-button--secondary"
                        onClick={() => void cancel(request.id)}
                        disabled={saving}
                      >
                        <X size={17} aria-hidden="true" />
                        Cancel request
                      </button>
                    )}
                    {status === 'requested' && canManage && (
                      <button
                        type="button"
                        className="rewards-button rewards-button--danger"
                        onClick={() => void decline(request.id)}
                        disabled={saving}
                      >
                        <Ban size={17} aria-hidden="true" />
                        Decline
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        )}

        {visibleRequests.length > visibleCount && (
          <button
            type="button"
            className="rewards-button rewards-button--secondary redemption-show-more"
            onClick={() => setVisibleCount(count =>
              count + INITIAL_REQUEST_LIMIT
            )}
          >
            Show more requests
          </button>
        )}
      </section>

      {canManage && (
        <section className="rewards-panel" aria-labelledby="manage-catalogue-title">
          <div className="rewards-section-heading">
            <div>
              <h2 id="manage-catalogue-title">Manage Catalogue</h2>
              <p>
                Deactivation stops new requests. Existing requests keep their captured details.
              </p>
            </div>
            <Pencil size={24} aria-hidden="true" />
          </div>

          <form className="redemption-editor" onSubmit={submitCatalogue} noValidate>
            <label>
              <span>Name</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                maxLength={80}
                required
                disabled={saving}
              />
            </label>
            <label>
              <span>Description (optional)</span>
              <input
                value={description}
                onChange={event => setDescription(event.target.value)}
                maxLength={240}
                disabled={saving}
              />
            </label>
            <label>
              <span>Cost</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="500"
                step="1"
                value={starCost}
                onChange={event => setStarCost(event.target.value)}
                required
                disabled={saving}
              />
            </label>
            <div className="redemption-editor__actions">
              <button
                type="submit"
                className="rewards-button rewards-button--primary"
                disabled={saving}
              >
                {editingId
                  ? <Check size={17} aria-hidden="true" />
                  : <Plus size={17} aria-hidden="true" />}
                {editingId ? 'Save item' : 'Add reward'}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="rewards-button rewards-button--secondary"
                  onClick={resetEditor}
                  disabled={saving}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                  Cancel edit
                </button>
              )}
            </div>
          </form>

          {catalogue.length > 0 && (
            <ul className="redemption-catalogue-manager">
              {catalogue.map((item, index) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.starCost} ★ · {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="redemption-catalogue-manager__actions">
                    <button
                      type="button"
                      className="rewards-button rewards-button--secondary"
                      onClick={() => edit(item)}
                      disabled={saving}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rewards-button rewards-button--secondary"
                      onClick={() => void toggleActive(item)}
                      disabled={saving}
                    >
                      {item.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button
                      type="button"
                      className="rewards-button rewards-button--secondary"
                      onClick={() => void move(index, -1)}
                      disabled={saving || index === 0}
                      aria-label={`Move ${item.name} up`}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                      Up
                    </button>
                    <button
                      type="button"
                      className="rewards-button rewards-button--secondary"
                      onClick={() => void move(index, 1)}
                      disabled={saving || index === catalogue.length - 1}
                      aria-label={`Move ${item.name} down`}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                      Down
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
