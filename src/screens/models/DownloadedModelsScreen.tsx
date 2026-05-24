import { useIsFocused } from "@react-navigation/native";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { LocalHuggingFaceModel } from "../../storage/modelStorage";
import { getDownloadedModels, removeDownloadedModel } from "../../storage/modelStorage";

export default function DownloadedModelsScreen() {
    const [models, setModels] = useState<LocalHuggingFaceModel[]>([]);
    const isFocused = useIsFocused();

    const load = useCallback(async () => {
        try {
            const map = await getDownloadedModels();
            const list = Object.values(map).sort((a, b) => (b.downloadedAt ?? 0) - (a.downloadedAt ?? 0));
            setModels(list);
        } catch (err) {
            console.error("Failed to load downloaded models", err);
        }
    }, []);

    useEffect(() => {
        if (isFocused) load();
    }, [isFocused, load]);

    const shorten = (p: string) => {
        if (p.length <= 60) return p;
        return "..." + p.slice(-57);
    };

    const handleDelete = async (item: LocalHuggingFaceModel) => {
        Alert.alert("Delete model", `Delete ${item.name}? This will remove the file and metadata.`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        const path = item.localFilePath;
                        if (path) {
                            const info = await FileSystem.getInfoAsync(path);
                            if (info.exists) {
                                await FileSystem.deleteAsync(path, { idempotent: true });
                            }
                        }
                        await removeDownloadedModel(item.id);
                        await load();
                    } catch (err) {
                        console.error("Failed to delete model file", err);
                        Alert.alert("Error", "Unable to delete model file.");
                    }
                },
            },
        ]);
    };

    const renderItem = ({ item }: { item: LocalHuggingFaceModel }) => (
        <View style={styles.row}>
            <View style={styles.meta}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.path}>{shorten(item.localFilePath ?? "")}</Text>
                <Text style={styles.date}>{new Date(item.downloadedAt ?? 0).toLocaleString()}</Text>
            </View>
            <TouchableOpacity style={styles.delete} onPress={() => handleDelete(item)}>
                <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <FlatList
                data={models}
                keyExtractor={(i) => i.id}
                renderItem={renderItem}
                ListEmptyComponent={<Text style={styles.empty}>No downloaded models found.</Text>}
                contentContainerStyle={models.length === 0 ? styles.emptyContainer : undefined}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: "#fff" },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#eee",
    },
    meta: { flex: 1 },
    name: { fontSize: 16, fontWeight: "600" },
    path: { fontSize: 12, color: "#666", marginTop: 4 },
    date: { fontSize: 12, color: "#999", marginTop: 4 },
    delete: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#ff3b30", borderRadius: 6 },
    deleteText: { color: "#fff", fontWeight: "600" },
    empty: { textAlign: "center", color: "#666" },
    emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
});
