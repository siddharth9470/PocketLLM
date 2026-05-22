import { FlatList, StyleSheet, View } from "react-native";

import ModelCard from "../../components/ModelCard";
import { colors, spacing } from "../../constants/theme";
import { MOCK_MODELS } from "../../data/mockModels";
import type { ModelsStackScreenProps } from "../../navigation/types";
import type { HuggingFaceModel } from "../../types/models";
import { useCallback, useEffect, useState } from "react";
import { getRequest } from "../../api/apiClient";
import { initializeModel, initiateChat } from "../../services/chatHelper";
import { initLlama, loadLlamaModelInfo } from "llama.rn";

export default function ModelsScreen(_props: ModelsStackScreenProps<"Models">) {
    const [huggingFaceModels, setHFModels] = useState<HuggingFaceModel[]>([]);

    useEffect(() => {
        initializeModel(
            "file:///data/user/0/com.app.pocketllm/files/hyperclovax-seed-text-instruct-1.5b-q4_k_m.gguf",
        ).then(() => {
            initiateChat("Hi, how are you?").then((res) => console.log(res));
        });

        const modelApi =
            "api/models?search=gguf+q4&limit=2000&sort=downloads&direction=-1&expand=pipeline_tag&expand=siblings&expand=tags&expand=likes&expand=private&expand=downloads&expand=createdAt&expand=lastModified&expand=author";
        getRequest(modelApi).then((res) => {
            setHFModels(res.data as HuggingFaceModel[]);
        });
    }, []);

    const renderModelCard = useCallback(
        ({ item }: { item: HuggingFaceModel }) => {
            return (
                <ModelCard
                    model={item}
                    onClickDownload={(item: HuggingFaceModel) => {
                        console.log();
                    }}
                />
            );
        },
        [],
    );

    return (
        <View style={styles.container}>
            <FlatList
                data={huggingFaceModels}
                keyExtractor={(item) => item._id}
                renderItem={renderModelCard}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    listContent: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.xxl,
    },
});

//file:///Users/siddharth/Library/Developer/CoreSimulator/Devices/3E79BE2B-A22E-4A39-805C-23E752F33BD4/data/Containers/Data/Application/23BC571B-2C1C-420B-8076-078FCA74ED07/Documents/tinyllama-function-call-GGFU-010524.gguf
