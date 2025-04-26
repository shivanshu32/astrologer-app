import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const EarningsScreen = () => {
  return (
    <View style={styles.container}>
      <Ionicons name="wallet-outline" size={64} color="#d1d5db" />
      <Text style={styles.title}>Earnings</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  }
});

export default EarningsScreen; 