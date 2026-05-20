import { FlatList, StyleSheet, View } from 'react-native';

import ModelCard from '../../components/ModelCard';
import { colors, spacing } from '../../constants/theme';
import { MOCK_MODELS } from '../../data/mockModels';
import type { ModelsStackScreenProps } from '../../navigation/types';
import type { HuggingFaceModel } from '../../types/models';

export default function ModelsScreen(_props: ModelsStackScreenProps<'Models'>) {
  return (
    <View style={styles.container}>
      <FlatList
        data={MOCK_MODELS}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <ModelCard model={item} />}
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
