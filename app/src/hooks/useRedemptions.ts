import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  approveRedemptionRequest,
  cancelRedemptionRequest,
  createCatalogueItem,
  createRedemptionRequest,
  declineRedemptionRequest,
  loadRedemptions,
  refundRedemptionRequest,
  reorderCatalogueItems,
  setCatalogueItemActive,
  updateCatalogueItem,
} from '../services/redemptionService';
import type {
  CatalogueItemInput,
  CreateRedemptionRequestInput,
  RedemptionStoreData,
} from '../types/redemption';

const EMPTY_STORE: RedemptionStoreData = {
  schemaVersion: 1,
  catalogue: [],
  requests: [],
};

export function useRedemptions() {
  const [store, setStore] =
    useState<RedemptionStoreData>(EMPTY_STORE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStore(await loadRedemptions());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Redemptions are unavailable.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadId = window.setTimeout(
      () => void refresh(),
      0
    );
    return () => window.clearTimeout(loadId);
  }, [refresh]);

  const runMutation = useCallback(
    async (mutation: () => Promise<void>) => {
      setSaving(true);
      try {
        await mutation();
        setStore(await loadRedemptions());
        setError(null);
      } catch (mutationError) {
        const message = mutationError instanceof Error
          ? mutationError.message
          : 'Unable to update Redemptions.';
        setError(message);
        throw mutationError;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return {
    catalogue: store.catalogue,
    requests: store.requests,
    loading,
    saving,
    error,
    refresh,
    createCatalogueItem: (
      input: CatalogueItemInput
    ) => runMutation(() =>
      createCatalogueItem(input)
    ),
    updateCatalogueItem: (
      itemId: string,
      input: Omit<CatalogueItemInput, 'id'>
    ) => runMutation(() =>
      updateCatalogueItem(itemId, input)
    ),
    setCatalogueItemActive: (
      itemId: string,
      active: boolean
    ) => runMutation(() =>
      setCatalogueItemActive(itemId, active)
    ),
    reorderCatalogue: (
      orderedIds: string[]
    ) => runMutation(() =>
      reorderCatalogueItems(orderedIds)
    ),
    createRequest: (
      input: CreateRedemptionRequestInput
    ) => runMutation(() =>
      createRedemptionRequest(input)
    ),
    cancelRequest: (
      requestId: string,
      actorProfileId: string
    ) => runMutation(() =>
      cancelRedemptionRequest(
        requestId,
        actorProfileId
      )
    ),
    declineRequest: (
      requestId: string,
      actorProfileId: string
    ) => runMutation(() =>
      declineRedemptionRequest(
        requestId,
        actorProfileId
      )
    ),
    approveRequest: (
      requestId: string,
      actorProfileId: string
    ) => runMutation(() =>
      approveRedemptionRequest(
        requestId,
        actorProfileId
      )
    ),
    refundRequest: (
      requestId: string,
      actorProfileId: string
    ) => runMutation(() =>
      refundRedemptionRequest(
        requestId,
        actorProfileId
      )
    ),
  };
}
