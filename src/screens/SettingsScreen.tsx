import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SettingsScreen = () => {
  // Placeholder setting options
  const settingsOptions = [
    { 
      title: 'Account', 
      icon: 'person-outline', 
      items: [
        { title: 'Profile Information', icon: 'information-circle-outline' },
        { title: 'Change Password', icon: 'key-outline' },
      ]
    },
    { 
      title: 'Preferences', 
      icon: 'options-outline', 
      items: [
        { title: 'Notifications', icon: 'notifications-outline' },
        { title: 'Language', icon: 'language-outline' },
        { title: 'Appearance', icon: 'color-palette-outline' },
      ]
    },
    { 
      title: 'Support', 
      icon: 'help-buoy-outline', 
      items: [
        { title: 'Help Center', icon: 'help-circle-outline' },
        { title: 'Contact Us', icon: 'mail-outline' },
        { title: 'Terms and Conditions', icon: 'document-text-outline' },
        { title: 'Privacy Policy', icon: 'shield-checkmark-outline' },
      ]
    },
  ];

  const renderSettingItem = (item, index) => (
    <TouchableOpacity 
      key={`setting-item-${index}`}
      style={styles.settingItem}
    >
      <Ionicons name={item.icon} size={22} color="#6366f1" />
      <Text style={styles.settingItemText}>{item.title}</Text>
      <Ionicons name="chevron-forward-outline" size={20} color="#9ca3af" />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {settingsOptions.map((section, sectionIndex) => (
        <View key={`section-${sectionIndex}`} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name={section.icon} size={20} color="#6366f1" />
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
          
          <View style={styles.sectionContent}>
            {section.items.map((item, itemIndex) => renderSettingItem(item, `${sectionIndex}-${itemIndex}`))}
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.logoutButton}>
        <Ionicons name="log-out-outline" size={22} color="#ef4444" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>Version 1.0.0</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 16,
    backgroundColor: '#6366f1',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  section: {
    marginVertical: 8,
    backgroundColor: 'white',
    borderRadius: 8,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
  sectionContent: {
    paddingVertical: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  settingItemText: {
    flex: 1,
    fontSize: 15,
    color: '#4b5563',
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 8,
  },
  logoutText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '500',
    marginLeft: 12,
  },
  versionText: {
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 36,
    color: '#9ca3af',
    fontSize: 12,
  }
});

export default SettingsScreen; 