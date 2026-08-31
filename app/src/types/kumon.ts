export type KumonSubject = 'maths' | 'english';

export type KumonAssignment = {
  id: string;
  localDate: string;
  childProfileId: string;
  subject: KumonSubject;
  assignmentLabel: string;
  totalUnits: number;
  completedUnits: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KumonStoreData = {
  schemaVersion: 1;
  assignments: KumonAssignment[];
};

export type CreateKumonAssignmentInput = {
  childProfileId: string;
  subject: KumonSubject;
  assignmentLabel: string;
  totalUnits: number;
};

export type UpdateKumonAssignmentInput = {
  assignmentLabel: string;
  totalUnits: number;
};
