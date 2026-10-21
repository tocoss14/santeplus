import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>SantéPlus</Text>
      <Text style={styles.subtitle}>Mutuelle santé digitale — Bénin</Text>
      <Text style={styles.body}>Squelette initial de l'application mobile native (iOS + Android).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold' },
  subtitle: { fontSize: 16, marginTop: 8, color: '#555' },
  body: { fontSize: 14, marginTop: 16, textAlign: 'center', color: '#666' },
});
