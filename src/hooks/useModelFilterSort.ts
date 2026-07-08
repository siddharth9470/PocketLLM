import { useCallback, useMemo, useState } from "react";

import { ModelFilterField, SORT_FIELD_CONFIG, type SortField, type SortOption } from "@/constants/modelFilters";
import type { HuggingFaceModel } from "@/types/models";

export function useModelFilterSort(
  models: HuggingFaceModel[],
  downloadedModelIds: Record<string, boolean> = {},
) {
  const [sortBy, setSortBy] = useState<SortOption>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [selectedPipelineTag, setSelectedPipelineTag] = useState<string | null>(null);
  const [showDownloadedOnly, setShowDownloadedOnly] = useState(false);

  const { uniqueAuthors, uniquePipelineTags } = useMemo(() => {
    const authors = [...new Set(models.map((model) => model[ModelFilterField.AUTHOR]).filter(Boolean))].sort();
    const pipelineTags = [
      ...new Set(models.map((model) => model[ModelFilterField.PIPELINE_TAG]).filter(Boolean)),
    ].sort();
    return { uniqueAuthors: authors, uniquePipelineTags: pipelineTags };
  }, [models]);

  const displayedModels = useMemo(() => {
    let result = models;

    if (selectedAuthor) {
      result = result.filter((model) => model[ModelFilterField.AUTHOR] === selectedAuthor);
    }

    if (selectedPipelineTag) {
      result = result.filter((model) => model[ModelFilterField.PIPELINE_TAG] === selectedPipelineTag);
    }

    if (showDownloadedOnly) {
      result = result.filter((model) => downloadedModelIds[model.id] === true);
    }

    if (sortBy) {
      const { getValue } = SORT_FIELD_CONFIG[sortBy];
      return [...result].sort((a, b) => getValue(b) - getValue(a));
    }

    return result;
  }, [models, selectedAuthor, selectedPipelineTag, showDownloadedOnly, downloadedModelIds, sortBy]);

  const toggleSort = useCallback((option: SortField) => {
    setSortBy((current) => (current === option ? null : option));
  }, []);

  const toggleAuthor = useCallback((author: string) => {
    setSelectedAuthor((current) => (current === author ? null : author));
  }, []);

  const togglePipelineTag = useCallback((pipelineTag: string) => {
    setSelectedPipelineTag((current) => (current === pipelineTag ? null : pipelineTag));
  }, []);

  const toggleDownloadedOnly = useCallback(() => {
    setShowDownloadedOnly((current) => !current);
  }, []);

  const hasActiveFilters =
    sortBy !== null || selectedAuthor !== null || selectedPipelineTag !== null || showDownloadedOnly;

  return {
    displayedModels,
    sortBy,
    selectedAuthor,
    selectedPipelineTag,
    showDownloadedOnly,
    uniqueAuthors,
    uniquePipelineTags,
    toggleSort,
    toggleAuthor,
    togglePipelineTag,
    toggleDownloadedOnly,
    hasActiveFilters,
  };
}
