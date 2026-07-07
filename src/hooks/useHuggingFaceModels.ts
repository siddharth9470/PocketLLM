import { useQuery } from "@tanstack/react-query";

import { HuggingFaceService } from "@/services/HuggingFaceService";

export function useHuggingFaceModels() {
  return useQuery({
    queryKey: ["huggingFaceModels"],
    queryFn: HuggingFaceService.fetchModels,
  });
}
