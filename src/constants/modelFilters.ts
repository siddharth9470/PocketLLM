import type { HuggingFaceModel } from "@/types/models";

export const SortField = {
  LIKES: "likes",
  DOWNLOADS: "downloads",
} as const;

export type SortField = (typeof SortField)[keyof typeof SortField];

export type SortOption = SortField | null;

export const ModelFilterField = {
  AUTHOR: "author",
  PIPELINE_TAG: "pipeline_tag",
} as const;

export const SORT_OPTIONS = [SortField.LIKES, SortField.DOWNLOADS] as const;

export const ModelFilterSortLabels = {
  TRIGGER_BUTTON: "Filter & Sort",
  MODAL_TITLE: "Filter & Sort",
  SORT_SECTION: "Sort",
  SORT_BY_LIKES: "Sort by Likes",
  SORT_BY_DOWNLOADS: "Sort by Downloads",
  SORT_DIRECTION: "↓ High to Low",
  STATUS_SECTION: "Status",
  DOWNLOADED_ONLY: "Downloaded models",
  AUTHOR_SECTION: "Author",
  PIPELINE_SECTION: "Pipeline",
  CLOSE: "Done",
} as const;

export const SORT_FIELD_CONFIG: Record<
  SortField,
  {
    label: string;
    getValue: (model: HuggingFaceModel) => number;
  }
> = {
  [SortField.LIKES]: {
    label: ModelFilterSortLabels.SORT_BY_LIKES,
    getValue: (model) => model.likes,
  },
  [SortField.DOWNLOADS]: {
    label: ModelFilterSortLabels.SORT_BY_DOWNLOADS,
    getValue: (model) => model.downloads,
  },
};
