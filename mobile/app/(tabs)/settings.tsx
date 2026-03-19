import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { supabase } from "@/lib/supabase";

export default function SettingsScreen() {
  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        {/* TODO: Provider management */}
        <View style={styles.item}>
          <Text style={styles.itemText}>SMS Providers</Text>
          <Text style={styles.itemSubtext}>Coming soon</Text>
        </View>

        {/* TODO: Phone number management */}
        <View style={styles.item}>
          <Text style={styles.itemText}>Phone Numbers</Text>
          <Text style={styles.itemSubtext}>Coming soon</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  item: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemText: {
    color: "#f9fafb",
    fontSize: 16,
  },
  itemSubtext: {
    color: "#6b7280",
    fontSize: 14,
  },
  logoutButton: {
    backgroundColor: "#991b1b",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: "auto",
  },
  logoutText: {
    color: "#fca5a5",
    fontSize: 16,
    fontWeight: "600",
  },
});
