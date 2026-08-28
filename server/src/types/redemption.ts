export type RedemptionCurrency = 'star';

export type RewardCatalogueItem = {
  id: string;
  name: string;
  description: string | null;
  starCost: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RedemptionContract = {
  catalogueItemId: string;
  name: string;
  description: string | null;
  currency: RedemptionCurrency;
  starCost: number;
};

export type RedemptionRequestClosure =
  | {
    kind: 'cancelled';
    eventKey: string;
    actorProfileId: string;
    occurredAt: string;
  }
  | {
    kind: 'declined';
    eventKey: string;
    actorProfileId: string;
    occurredAt: string;
  };

export type RedemptionRequest = {
  id: string;
  eventKey: string;
  profileId: string;
  requestedByProfileId: string;
  contract: RedemptionContract;
  requestedAt: string;
  localDate: string;
  timeZone: string;
  closure: RedemptionRequestClosure | null;
};

export type RedemptionStoreData = {
  schemaVersion: 1;
  catalogue: RewardCatalogueItem[];
  requests: RedemptionRequest[];
};

export type CreateCatalogueItemInput = {
  id: string;
  name: string;
  description: string | null;
  starCost: number;
};

export type UpdateCatalogueItemInput = Omit<
  CreateCatalogueItemInput,
  'id'
>;

export type CreateRedemptionRequestInput = {
  id: string;
  catalogueItemId: string;
  profileId: string;
  requestedByProfileId: string;
  timeZone: string;
};
