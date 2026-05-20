import { StyleSheet, Text, View } from 'react-native';

import type { HomeScreenProps } from '../navigation/types';

export default function HomeScreen(_props: HomeScreenProps) {
  return (
    <View style={styles.container}>
      <Text>Home Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
