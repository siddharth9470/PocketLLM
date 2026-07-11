import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import type { ChatAttachmentKind } from "@/types/chat";
import { generateChatId } from "@/utils/chatIds";

/** Maximum edge length for stored chat images after resize. */
const MAX_IMAGE_EDGE_PX = 1920;

/** JPEG quality for persisted images (0–1). Balances size and visual fidelity. */
const IMAGE_JPEG_QUALITY = 0.78;

/** Reject imported audio above this size when we cannot re-encode on-device. */
const MAX_IMPORTED_AUDIO_BYTES = 12 * 1024 * 1024;

/** Cap voice-note duration to keep WAV payloads bounded on mobile. */
const MAX_RECORDING_DURATION_MS = 45_000;

export interface PersistedAttachmentDraft {
  kind: ChatAttachmentKind;
  storagePath: string;
  mimeType: string;
  originalFileName?: string;
  fileSizeBytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
}

/** Returns the sandbox directory used for all compressed chat attachments. */
function getAttachmentsRoot(): string {
  const base = FileSystem.documentDirectory;
  if (!base) {
    throw new Error("Document directory is unavailable for chat attachments.");
  }
  return `${base}chat-attachments/`;
}

/** Creates the attachments root and a per-conversation subdirectory. */
async function ensureConversationAttachmentDir(conversationId: string): Promise<string> {
  const root = getAttachmentsRoot();
  const conversationDir = `${root}${conversationId}/`;

  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  await FileSystem.makeDirectoryAsync(conversationDir, { intermediates: true });

  return conversationDir;
}

/** Builds a stable file URI inside the conversation attachment folder. */
function buildDestinationUri(conversationDir: string, kind: ChatAttachmentKind, extension: string): string {
  return `${conversationDir}${kind}-${generateChatId()}${extension}`;
}

/** Reads byte size for a local file URI. */
async function getFileSizeBytes(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) {
    return 0;
  }
  return info.size ?? 0;
}

/** Normalizes any local URI to a `file://` path for SQLite + llama.rn consumers. */
export function toFileUri(path: string): string {
  const trimmed = path.trim();
  if (trimmed.startsWith("file://")) {
    return trimmed;
  }
  return trimmed.startsWith("/") ? `file://${trimmed}` : `file:///${trimmed}`;
}

/**
 * Downscales and re-encodes an image as JPEG to minimize on-device storage.
 * PNG and HEIC inputs are converted; quality is tuned for chat vision models.
 */
export async function persistCompressedImage(
  sourceUri: string,
  conversationId: string,
): Promise<PersistedAttachmentDraft> {
  const conversationDir = await ensureConversationAttachmentDir(conversationId);
  const destination = buildDestinationUri(conversationDir, "image", ".jpg");

  const manipulated = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: MAX_IMAGE_EDGE_PX } }],
    { compress: IMAGE_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

  await FileSystem.copyAsync({ from: manipulated.uri, to: destination });

  return {
    kind: "image",
    storagePath: toFileUri(destination),
    mimeType: "image/jpeg",
    fileSizeBytes: await getFileSizeBytes(destination),
    width: manipulated.width,
    height: manipulated.height,
  };
}

/** Maps a MIME type or filename to the audio format llama.rn accepts. */
function resolveLlamaAudioFormat(mimeType: string, fileName?: string): "wav" | "mp3" {
  const lowerMime = mimeType.toLowerCase();
  const lowerName = (fileName ?? "").toLowerCase();

  if (lowerMime.includes("mpeg") || lowerMime.includes("mp3") || lowerName.endsWith(".mp3")) {
    return "mp3";
  }

  return "wav";
}

/**
 * Imports audio into the sandbox. MP3/M4A are copied as-is (already compressed).
 * Large WAV files are rejected because on-device transcoding is not available.
 */
export async function persistImportedAudio(
  sourceUri: string,
  conversationId: string,
  mimeType: string,
  originalFileName?: string,
): Promise<PersistedAttachmentDraft> {
  const sizeBefore = await getFileSizeBytes(sourceUri);
  const format = resolveLlamaAudioFormat(mimeType, originalFileName);

  if (format === "wav" && sizeBefore > MAX_IMPORTED_AUDIO_BYTES) {
    throw new Error(
      "This audio file is too large. Use a shorter clip, MP3, or record with the microphone.",
    );
  }

  const conversationDir = await ensureConversationAttachmentDir(conversationId);
  const extension = format === "mp3" ? ".mp3" : ".wav";
  const destination = buildDestinationUri(conversationDir, "audio", extension);

  await FileSystem.copyAsync({ from: sourceUri, to: destination });

  return {
    kind: "audio",
    storagePath: toFileUri(destination),
    mimeType: format === "mp3" ? "audio/mpeg" : "audio/wav",
    originalFileName,
    fileSizeBytes: await getFileSizeBytes(destination),
  };
}

/** Expo AV recording preset tuned for speech; output is WAV for llama.rn compatibility. */
const VOICE_RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: ".wav",
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16_000,
    numberOfChannels: 1,
    bitRate: 64_000,
  },
  ios: {
    extension: ".wav",
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16_000,
    numberOfChannels: 1,
    bitRate: 64_000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: Audio.RecordingOptionsPresets.HIGH_QUALITY.web,
};

/** Requests microphone permission required for voice notes. */
export async function ensureMicrophonePermission(): Promise<boolean> {
  const permission = await Audio.requestPermissionsAsync();
  return permission.granted;
}

/** Configures the audio session for reliable recording on iOS and Android. */
export async function prepareAudioSessionForRecording(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

/** Starts a new voice recording using the compressed speech-oriented preset. */
export async function startVoiceRecording(): Promise<Audio.Recording> {
  const granted = await ensureMicrophonePermission();
  if (!granted) {
    throw new Error("Microphone permission is required to record voice messages.");
  }

  await prepareAudioSessionForRecording();

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
  await recording.startAsync();

  return recording;
}

/**
 * Stops an active recording, moves it into the conversation attachment folder,
 * and returns metadata for SQLite persistence.
 */
export async function finalizeVoiceRecording(
  recording: Audio.Recording,
  conversationId: string,
): Promise<PersistedAttachmentDraft> {
  try {
    await recording.stopAndUnloadAsync();
  } catch (error) {
    console.error("Failed to stop voice recording:", error);
    throw error;
  }

  const status = await recording.getStatusAsync();
  const uri = recording.getURI();

  if (!uri) {
    throw new Error("Voice recording did not produce an audio file.");
  }

  const durationMillis =
    "durationMillis" in status && typeof status.durationMillis === "number" ? status.durationMillis : undefined;
  const durationMs =
    durationMillis != null ? Math.min(durationMillis, MAX_RECORDING_DURATION_MS) : undefined;

  const draft = await persistImportedAudio(uri, conversationId, "audio/wav", Platform.OS === "ios" ? "voice.wav" : "voice.wav");
  return { ...draft, durationMs };
}

/** Opens the system image library and returns a compressed persisted attachment. */
export async function pickAndPersistImage(conversationId: string): Promise<PersistedAttachmentDraft | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is required to attach images.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    allowsEditing: false,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return persistCompressedImage(result.assets[0].uri, conversationId);
}

/** Opens the document picker for audio files and persists them into the sandbox. */
export async function pickAndPersistAudio(conversationId: string): Promise<PersistedAttachmentDraft | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["audio/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];
  return persistImportedAudio(asset.uri, conversationId, asset.mimeType ?? "audio/wav", asset.name);
}

/** Deletes attachment files from disk when a conversation or message is removed. */
export async function deleteAttachmentFiles(storagePaths: string[]): Promise<void> {
  await Promise.all(
    storagePaths.map(async (path) => {
      try {
        await FileSystem.deleteAsync(path.replace(/^file:\/\//, ""), { idempotent: true });
      } catch (error) {
        console.warn(`Failed to delete attachment at ${path}:`, error);
      }
    }),
  );
}
