import { FlatList, StyleSheet, View } from "react-native";

import ModelCard from "../../components/ModelCard";
import { colors, spacing } from "../../constants/theme";
import { MOCK_MODELS } from "../../data/mockModels";
import type { ModelsStackScreenProps } from "../../navigation/types";
import type { HuggingFaceModel } from "../../types/models";
import { useCallback, useEffect, useState } from "react";
import { getRequest } from "../../api/apiClient";

export default function ModelsScreen(_props: ModelsStackScreenProps<"Models">) {
    const [huggingFaceModels, setHFModels] = useState<HuggingFaceModel[]>([]);

    useEffect(() => {
        getRequest(
            "api/models?search=ggfu&limit=2000&sort=downloads&direction=-1",
        ).then((res) => {
            console.log(res.data);
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
