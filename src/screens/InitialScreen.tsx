import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { InitialScreenProps } from '../navigation/types';

export default function InitialScreen({ navigation }: InitialScreenProps) {
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      navigation.replace('Home');
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
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
