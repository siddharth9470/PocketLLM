export type DownloadStatus = "idle" | "pending" | "downloading" | "completed" | "failed";

export interface HFSibling {
  rfilename: string;
}

export interface HFModelDetails {
  siblings: HFSibling[];
}

export interface ModelDownloadInfo {
  localFilePath?: string;
  status: DownloadStatus;
  downloadedAt?: number;
  fileSizeBytes?: number;
}

export interface HuggingFaceModel {
  // --- Remote API Fields ---
  _id: string;
  id: string;
  name: string;
  likes: number;
  private: boolean;
  downloads: number;
  tags: string[];
  author: string;
  library_name: string;
  createdAt: string;
  modelId: string;
  pipeline_tag: string;
  siblings: HFSibling[];

  // --- Local Device State ---
  // This is optional (?) because when you first fetch the list
  // from the internet, this data won't exist yet.
  downloadInfo?: ModelDownloadInfo;
}

export type DownloadedMap = Record<string, HuggingFaceModel>;
