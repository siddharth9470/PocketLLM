import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "../constants/theme";
import { getDownloadUrlForModel } from "../services/downloadHelpers";
import { useModelDownloader } from "../services/useModelDownloader";
import type { HuggingFaceModel } from "../types/models";
import { formatCount, parseModelId } from "../utils/parseModelId";
import PrimaryButton from "./PrimaryButton";
import TagChip from "./TagChip";

interface ModelCardProps {
    model: HuggingFaceModel;
    onClickDownload: (item: HuggingFaceModel) => void;
}

export default function ModelCard({ model }: ModelCardProps) {
    const { author, name } = parseModelId(model.id);

    const { startDownload, cancelDownload, initDownload, progress, isDownloading } = useModelDownloader(model);

    return (
        <View style={styles.card}>
            <Text style={styles.author}>{author}</Text>
            <Text style={styles.name}>{name}</Text>

            <View style={styles.metricsRow}>
                <View style={styles.metric}>
                    <Ionicons name="download-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.metricText}>{formatCount(model.downloads)}</Text>
                </View>
                <View style={styles.metric}>
                    <Ionicons name="heart-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.metricText}>{formatCount(model.likes)}</Text>
                </View>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tagsScroll}
                contentContainerStyle={styles.tagsContent}
            >
                {model.tags.map((tag) => (
                    <TagChip key={`${model.id}-${tag}`} label={tag} />
                ))}
            </ScrollView>

            {isDownloading ? (
                <>
                    <View style={styles.progressTrack}>
                        <View
                            style={[
                                styles.progressFill,
                                { width: `${progress}%` }, // Updated to use the hook's progress
                            ]}
                        />
                    </View>
                    <Text style={styles.progressText}>{progress}%</Text>
                </>
            ) : (
                <PrimaryButton
                    label={"Download"}
                    onPress={async () => {
                        // 1. Pass the exact filename from Hugging Face instead of model.id
                        // 2. Capture the returned URI
                        const localUri = await initDownload(model);

                        if (localUri) {
                            console.log("Model successfully downloaded and stored at:", localUri);
                        }
                    }}
                    loading={isDownloading}
                    // disabled={isCompleted || isDownloading}
                    // variant={isCompleted ? "success" : "primary"}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 2,
    },
    author: {
        ...typography.caption,
        color: colors.textSecondary,
        marginBottom: spacing.xs,
    },
    name: {
        ...typography.headline,
        fontSize: 18,
        color: colors.text,
        marginBottom: spacing.md,
    },
    metricsRow: {
        flexDirection: "row",
        gap: spacing.xl,
        marginBottom: spacing.md,
    },
    metric: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
    },
    metricText: {
        ...typography.caption,
        color: colors.textSecondary,
    },
    tagsScroll: {
        marginBottom: spacing.lg,
    },
    tagsContent: {
        paddingRight: spacing.lg,
    },
    progressTrack: {
        height: 4,
        backgroundColor: colors.progressTrack,
        borderRadius: radii.pill,
        overflow: "hidden",
        marginBottom: spacing.md,
    },
    progressFill: {
        height: "100%",
        backgroundColor: colors.primary,
    },
    progressText: {
        ...typography.caption,
        color: colors.textSecondary,
        marginBottom: spacing.md,
        alignSelf: "center",
    },
});
