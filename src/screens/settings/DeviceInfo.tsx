import { ANDROID_DATABASE_PATH, IOS_LIBRARY_PATH } from "@op-engineering/op-sqlite";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  getDeviceName,
  getFreeDiskStorage,
  getHardware,
  getModel,
  getSystemName,
  getSystemVersion,
  getTotalDiskCapacity,
  getTotalMemory,
  getUsedMemory,
  supportedAbis,
} from "react-native-device-info";

import { colors, radii, spacing, typography } from "@/constants/theme";
import type { SettingsStackScreenProps } from "@/navigation/types";

type InfoRow = { label: string; value: string; detail?: string };
type InfoSection = { title: string; rows: InfoRow[] };

const UNAVAILABLE = "Unavailable";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return UNAVAILABLE;
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function textOrUnavailable(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : UNAVAILABLE;
}

function joinPath(base: string, name: string): string {
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}

async function getPathSizeBytes(path: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return 0;
  if (!info.isDirectory) return info.size ?? 0;
  const children = await FileSystem.readDirectoryAsync(path);
  const sizes = await Promise.all(children.map((child) => getPathSizeBytes(joinPath(path, child))));
  return sizes.reduce((sum, n) => sum + n, 0);
}

async function getAppStorageBytes(): Promise<{ total: number; documents: number; cache: number; databases: number }> {
  const dbBase = Platform.OS === "ios" ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH;
  const dbFiles = ["pocketllm_encrypted_models.db", "pocketllm_encrypted_chat.db"];
  const dbSuffixes = ["", "-wal", "-shm", "-journal"];

  let databases = 0;
  for (const file of dbFiles) {
    for (const suffix of dbSuffixes) {
      databases += await getPathSizeBytes(joinPath(dbBase, `${file}${suffix}`));
    }
  }

  const documents = FileSystem.documentDirectory ? await getPathSizeBytes(FileSystem.documentDirectory) : 0;
  const cache = FileSystem.cacheDirectory ? await getPathSizeBytes(FileSystem.cacheDirectory) : 0;
  return { total: documents + cache + databases, documents, cache, databases };
}

async function getAndroidAvailableRam(): Promise<number | null> {
  try {
    const meminfo = await FileSystem.readAsStringAsync("/proc/meminfo");
    const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/i) ?? meminfo.match(/MemFree:\s+(\d+)\s+kB/i);
    return match ? Number.parseInt(match[1], 10) * 1024 : null;
  } catch {
    return null;
  }
}

async function getAndroidCpuCores(): Promise<number | null> {
  try {
    const present = await FileSystem.readAsStringAsync("/sys/devices/system/cpu/present");
    const range = present.trim().match(/(\d+)-(\d+)/);
    if (range) return Number.parseInt(range[2], 10) - Number.parseInt(range[1], 10) + 1;
    const ids = present.split(",").map((v) => v.trim()).filter(Boolean);
    return ids.length > 0 ? ids.length : null;
  } catch {
    return null;
  }
}

async function loadDeviceInfo(): Promise<InfoSection[]> {
  const [
    deviceName,
    model,
    systemName,
    systemVersion,
    totalMemoryInfo,
    usedMemory,
    freeStorage,
    totalStorage,
    abis,
    hardware,
    appStorage,
    availableRam,
    cpuCores,
  ] = await Promise.all([
    getDeviceName(),
    getModel(),
    getSystemName(),
    getSystemVersion(),
    getTotalMemory(),
    getUsedMemory(),
    getFreeDiskStorage(),
    getTotalDiskCapacity(),
    supportedAbis(),
    Platform.OS === "android" ? getHardware() : Promise.resolve(null),
    getAppStorageBytes(),
    Platform.OS === "android" ? getAndroidAvailableRam() : Promise.resolve(null),
    Platform.OS === "android" ? getAndroidCpuCores() : Promise.resolve(null),
  ]);

  const totalRam = Device.totalMemory ?? totalMemoryInfo;
  const osName = textOrUnavailable(Device.osName ?? systemName);
  const osVersion = textOrUnavailable(Device.osVersion ?? systemVersion);
  const gpu =
    Platform.OS === "ios"
      ? typeof Device.modelId === "string"
        ? `Apple GPU (${Device.modelId})`
        : "Apple integrated GPU"
      : "Integrated mobile GPU";

  const sections: InfoSection[] = [
    {
      title: "Device",
      rows: [
        { label: "Device name", value: textOrUnavailable(deviceName) },
        { label: "Model", value: textOrUnavailable(Device.modelName ?? model) },
        { label: "Manufacturer", value: textOrUnavailable(Device.manufacturer) },
        { label: "Brand", value: textOrUnavailable(Device.brand) },
      ],
    },
    {
      title: "System",
      rows: [
        { label: "Operating system", value: osName },
        { label: "OS version", value: osVersion },
        ...(Platform.OS === "android"
          ? [
              {
                label: "Android version",
                value: osVersion,
                detail: Device.platformApiLevel ? `API level ${Device.platformApiLevel}` : undefined,
              },
            ]
          : []),
      ],
    },
    {
      title: "Memory",
      rows: [
        { label: "Total RAM", value: formatBytes(totalRam) },
        {
          label: "Available RAM",
          value: availableRam == null ? UNAVAILABLE : formatBytes(availableRam),
          detail: Platform.OS === "ios" ? "System-wide free RAM is not exposed on iOS." : undefined,
        },
        { label: "App RAM usage", value: formatBytes(usedMemory), detail: "Current PocketLLM process memory." },
      ],
    },
    {
      title: "Storage",
      rows: [
        { label: "Storage available", value: formatBytes(freeStorage) },
        { label: "Total storage", value: formatBytes(totalStorage) },
      ],
    },
    {
      title: "Processor",
      rows: [
        {
          label: "CPU cores",
          value: cpuCores == null ? UNAVAILABLE : String(cpuCores),
          detail: Platform.OS === "ios" ? "CPU core count is not exposed on iOS." : undefined,
        },
        {
          label: "CPU architectures",
          value: Device.supportedCpuArchitectures?.length
            ? Device.supportedCpuArchitectures.join(", ")
            : UNAVAILABLE,
        },
        { label: "Supported ABIs", value: abis.length ? abis.join(", ") : UNAVAILABLE },
        ...(Platform.OS === "android" ? [{ label: "Hardware platform", value: textOrUnavailable(hardware) }] : []),
        { label: "GPU", value: gpu },
        {
          label: "Inference backend",
          value: Platform.OS === "ios" ? "Metal (GPU-accelerated)" : "CPU",
        },
      ],
    },
    {
      title: "Application",
      rows: [
        {
          label: "App disk usage",
          value: formatBytes(appStorage.total),
          detail: "Sandbox storage allocated to PocketLLM.",
        },
        { label: "Documents", value: formatBytes(appStorage.documents), detail: "Includes downloaded models." },
        { label: "Cache", value: formatBytes(appStorage.cache) },
        { label: "Databases", value: formatBytes(appStorage.databases) },
      ],
    },
  ];

  return sections;
}

function SectionCard({ section }: { section: InfoSection }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.rows.map((row) => (
        <View key={`${section.title}-${row.label}`} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowValue}>{row.value}</Text>
          {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export default function DeviceInfoScreen(_props: SettingsStackScreenProps<"DeviceInfo">) {
  const [sections, setSections] = useState<InfoSection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSections(await loadDeviceInfo());
    } catch (err) {
      console.error("Failed to load device info:", err);
      setError("Could not load device information.");
      setSections(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading && sections !== null} onRefresh={() => void refresh()} />}
    >
      {loading && !sections ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Scanning device…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {sections?.map((section) => <SectionCard key={section.title} section={section} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typography.headline, color: colors.text },
  row: { gap: spacing.xs },
  rowLabel: { ...typography.caption, color: colors.textSecondary },
  rowValue: { ...typography.body, color: colors.text },
  rowDetail: { ...typography.caption, color: colors.textTertiary },
  centered: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  muted: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
