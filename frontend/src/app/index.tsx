import { View, Text, StyleSheet } from 'react-native';

// Placeholder — replaced in Layer 2 with the real Library screen
export default function LibraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Synodos</Text>
      <Text style={styles.sub}>Layer 1 — Foundation ✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#c9a84c',
    fontSize: 32,
    fontWeight: 'bold',
  },
  sub: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
});