export interface HuggingFaceModel {
    _id: string;
    id: string;
    name: string;
    likes: number;
    private: boolean;
    downloads: number;
    tags: string[];
    library_name: string;
    createdAt: string;
    modelId: string;
    pipeline_tag: string;
    siblings: HFSibling[];
}

export type DownloadStatus = "idle" | "downloading" | "completed" | "failed";

export interface ModelDownloadState {
    status: DownloadStatus;
    progress: number;
    localPath?: string;
}

export interface HFSibling {
    rfilename: string;
}

export interface HFModelDetails {
    siblings: HFSibling[];
}
