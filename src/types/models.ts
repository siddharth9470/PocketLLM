export interface HuggingFaceModel {
  _id: string;
  id: string;
  likes: number;
  private: boolean;
  downloads: number;
  tags: string[];
  library_name: string;
  createdAt: string;
  modelId: string;
}

export type DownloadStatus = 'idle' | 'downloading' | 'completed' | 'failed';

export interface ModelDownloadState {
  status: DownloadStatus;
  progress: number;
  localPath?: string;
}
