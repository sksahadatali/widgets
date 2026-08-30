export type MealType =
  | 'breakfast'
  | 'lunch'
  | 'dinner';

export type MealPlanEntry = {
  id: string;
  localDate: string;
  mealType: MealType;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type MealPlanStoreData = {
  schemaVersion: 1;
  entries: MealPlanEntry[];
};

export type CreateMealPlanEntryInput = {
  id: string;
  localDate: string;
  mealType: MealType;
  title: string;
};

export type UpdateMealPlanEntryInput = {
  title?: string;
  localDate?: string;
  mealType?: MealType;
};
