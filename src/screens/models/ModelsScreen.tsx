import { Ionicons } from "@expo/vector-icons";
import { initLlama, loadLlamaModelInfo } from "llama.rn";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getRequest } from "../../api/apiClient";
import ModelCard from "../../components/ModelCard";
import { colors, spacing } from "../../constants/theme";
import type { ModelsStackScreenProps } from "../../navigation/types";
import { initializeModel, initiateChat } from "../../services/chatHelper";
import { useModelDownloader } from "../../services/useModelDownloader";
import type { HuggingFaceModel } from "../../types/models";

export default function ModelsScreen(props: ModelsStackScreenProps<"Models">) {
  const [huggingFaceModels, setHFModels] = useState<HuggingFaceModel[]>([]);
  const {
    startDownload,
    cancelDownload,
    downloadProgress,
    activeDownloads,
    retreiveCompletedDownloads,
  } = useModelDownloader();
  const { navigation } = props;

  // Add header button to navigate to downloaded models screen
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate("DownloadedModels")}
          style={{ marginRight: 12 }}
        >
          <Ionicons name="download-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    // initializeModel(
    //     "file:///data/user/0/com.app.pocketllm/files/hyperclovax-seed-text-instruct-1.5b-q4_k_m.gguf"
    // ).then(() => {
    //     initiateChat("Hi, how are you?").then((res) => console.log(res));
    // });
    // retreiveCompletedDownloads();
    const modelApi =
      "https://huggingface.co/api/models?search=gguf+q4&limit=2000&sort=downloads&direction=-1&expand=pipeline_tag&expand=siblings&expand=tags&expand=likes&expand=private&expand=downloads&expand=createdAt&expand=lastModified&expand=author";
    console.log("data");
    fetch(modelApi).then((res) => {
      res.json().then((data) => {
        setHFModels(data as HuggingFaceModel[]);
      });
    });
  }, []);

  const renderModelCard = useCallback(
    ({ item }: { item: HuggingFaceModel }) => {
      return (
        <ModelCard
          model={item}
          downloadProgress={downloadProgress[item.id]}
          activeDownload={activeDownloads[item.id]}
          onClickDownload={(item: HuggingFaceModel) => {
            startDownload(item);
          }}
        />
      );
    },
    [startDownload, downloadProgress, activeDownloads],
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
