import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { supabase } from "@/lib/supabase";
import { removePushToken } from "@/lib/notifications";
import { colors, spacing } from "@/lib/constants";

interface Provider {
  id: string;
  type: string;
}

interface PhoneNumber {
  id: string;
  number: string;
  providers: { type: string } | null;
}

type PhoneNumberRow = {
  id: string;
  number: string;
  providers: { type: string }[] | { type: string } | null;
};

export default function SettingsScreen() {
  const [email, setEmail] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    // Get user info
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) setEmail(user.email || null);

    // Get providers
    const { data: providerData } = await supabase
      .from("providers")
      .select("id, type");
    if (providerData) setProviders(providerData as Provider[]);

    // Get phone numbers with provider info
    const { data: numberData } = await supabase
      .from("phone_numbers")
      .select("id, number, providers:provider_id(type)");
    if (numberData) {
      setPhoneNumbers(
        (numberData as PhoneNumberRow[]).map((phoneNumber) => ({
          ...phoneNumber,
          providers: Array.isArray(phoneNumber.providers)
            ? phoneNumber.providers[0] ?? null
            : phoneNumber.providers,
        }))
      );
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await removePushToken();
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  const providerIcon = (type: string) => {
    switch (type) {
      case "twilio":
        return "📞";
      case "telnyx":
        return "🔗";
      default:
        return "📱";
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.blueLight} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Account section */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Email</Text>
          <Text style={styles.cardValue}>{email || "—"}</Text>
        </View>
      </View>

      {/* Providers section */}
      <Text style={styles.sectionTitle}>SMS Providers</Text>
      {providers.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No providers configured</Text>
          <Text style={styles.emptySubtext}>
            Add providers via the web dashboard
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {providers.map((p, idx) => (
            <View
              key={p.id}
              style={[
                styles.cardRow,
                idx < providers.length - 1 && styles.cardRowBorder,
              ]}
            >
              <Text style={styles.cardLabel}>
                {providerIcon(p.type)} {p.type}
              </Text>
              <Text style={styles.cardBadge}>Active</Text>
            </View>
          ))}
        </View>
      )}

      {/* Phone Numbers section */}
      <Text style={styles.sectionTitle}>Phone Numbers</Text>
      {phoneNumbers.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No phone numbers</Text>
          <Text style={styles.emptySubtext}>
            Add numbers via the web dashboard
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {phoneNumbers.map((pn, idx) => (
            <View
              key={pn.id}
              style={[
                styles.cardRow,
                idx < phoneNumbers.length - 1 && styles.cardRowBorder,
              ]}
            >
              <Text style={styles.cardValue}>{pn.number}</Text>
              <Text style={styles.cardSubValue}>
                {pn.providers?.type || "Unknown"}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* App info */}
      <Text style={styles.sectionTitle}>App</Text>
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Version</Text>
          <Text style={styles.cardSubValue}>0.1.0</Text>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
  },
  cardRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardLabel: {
    color: colors.text,
    fontSize: 16,
  },
  cardValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
  },
  cardSubValue: {
    color: colors.textMuted,
    fontSize: 14,
  },
  cardBadge: {
    color: colors.greenLight,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 13,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: 4,
  },
  logoutButton: {
    backgroundColor: colors.red,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: spacing.xxl,
  },
  logoutText: {
    color: colors.redLight,
    fontSize: 16,
    fontWeight: "600",
  },
});
